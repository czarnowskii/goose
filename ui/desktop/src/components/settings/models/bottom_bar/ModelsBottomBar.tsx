import { Bot, Check, LoaderCircle } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useModelAndProvider } from '../../../ModelAndProviderContext';
import { View } from '../../../../utils/navigationUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../../ui/dropdown-menu';
import Model, { fetchModelsForProviders, getProviderMetadata } from '../modelInterface';
import { getModelDisplayName } from '../predefinedModelsUtils';
import { defineMessages, useIntl } from '../../../../i18n';
import type { Message } from '../../../../types/message';
import type { ProviderDetails, ThinkingEffort } from '../../../../types/providers';
import {
  acpListProviderDetails,
  acpReadThinkingEffort,
  acpSaveThinkingEffort,
} from '../../../../acp/providers';
import { trackModelChanged } from '../../../../utils/analytics';

const i18n = defineMessages({
  selectModel: {
    id: 'modelsBottomBar.selectModel',
    defaultMessage: 'Select Model',
  },
  currentModel: {
    id: 'modelsBottomBar.currentModel',
    defaultMessage: 'Current model',
  },
  loadingModel: {
    id: 'modelsBottomBar.loadingModel',
    defaultMessage: 'Loading model...',
  },
  resolvedModel: {
    id: 'modelsBottomBar.resolvedModel',
    defaultMessage: 'Resolved model',
  },
  provider: {
    id: 'modelsBottomBar.provider',
    defaultMessage: 'Provider',
  },
  model: {
    id: 'modelsBottomBar.model',
    defaultMessage: 'Model',
  },
  reasoningEffort: {
    id: 'modelsBottomBar.reasoningEffort',
    defaultMessage: 'Reasoning effort',
  },
  useModel: {
    id: 'modelsBottomBar.useModel',
    defaultMessage: 'Use model',
  },
  loadingModels: {
    id: 'modelsBottomBar.loadingModels',
    defaultMessage: 'Loading models…',
  },
  noModels: {
    id: 'modelsBottomBar.noModels',
    defaultMessage: 'No models available for this provider.',
  },
  modelLoadFailed: {
    id: 'modelsBottomBar.modelLoadFailed',
    defaultMessage: 'Could not load models.',
  },
});

const thinkingEfforts: ThinkingEffort[] = ['off', 'low', 'medium', 'high', 'max'];

export function getThinkingEffortIndex(effort: ThinkingEffort): number {
  return thinkingEfforts.indexOf(effort);
}

export function getThinkingEffortAtIndex(index: number): ThinkingEffort {
  return thinkingEfforts[Math.max(0, Math.min(Math.round(index), thinkingEfforts.length - 1))];
}

interface ModelsBottomBarProps {
  sessionId: string | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  setView: (view: View) => void;
  sessionModel?: string | null;
  sessionProvider?: string | null;
  latestInference?: Message['metadata']['inference'] | null;
  onModelChanged: (override: { model: string; provider: string }) => void;
  sessionLoaded?: boolean;
}

export default function ModelsBottomBar({
  sessionId,
  dropdownRef,
  sessionModel,
  sessionProvider,
  latestInference,
  onModelChanged,
  sessionLoaded,
}: ModelsBottomBarProps) {
  // ChatInput owns the override state and passes effective model/provider as sessionModel/sessionProvider.
  // Fall back to config defaults when no session-specific model is available.
  const {
    changeModel,
    currentModel: configModel,
    currentProvider: configProvider,
  } = useModelAndProvider();
  const currentModel = sessionModel ?? configModel;
  const currentProvider = sessionProvider ?? configProvider;

  const intl = useIntl();
  const [displayProvider, setDisplayProvider] = useState<string | null>(null);
  const [displayModelName, setDisplayModelName] = useState<string>(
    intl.formatMessage(i18n.selectModel)
  );
  const [providerDefaultModel, setProviderDefaultModel] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || '');
  const [selectedModel, setSelectedModel] = useState(currentModel || '');
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>('off');
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelLoadError, setModelLoadError] = useState('');
  const [applyingModel, setApplyingModel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Show a visible loading placeholder while session metadata is still being fetched,
  // rather than flashing the config default or leaving the footer blank.
  const isModelLoading = Boolean(sessionId && !sessionLoaded);
  const displayModel = currentModel || providerDefaultModel || displayModelName;
  const resolvedModel = latestInference?.resolvedModel ?? null;
  const shouldShowResolvedModel = Boolean(
    !isModelLoading &&
    resolvedModel &&
    latestInference?.provider === currentProvider &&
    latestInference?.requestedModel === currentModel &&
    resolvedModel !== currentModel
  );
  const loadingModelLabel = intl.formatMessage(i18n.loadingModel);
  const triggerLabel = isModelLoading ? loadingModelLabel : displayModel;
  const menuModelLabel = isModelLoading ? loadingModelLabel : displayModelName;

  useEffect(() => {
    if (!currentProvider) return;
    getProviderMetadata(currentProvider)
      .then((metadata) => {
        setDisplayProvider(metadata.display_name || currentProvider);
      })
      .catch(() => {
        setDisplayProvider(currentProvider);
      });
  }, [currentProvider, currentModel]);

  // Fetch provider default model when provider changes and no current model
  useEffect(() => {
    if (currentProvider && !currentModel) {
      (async () => {
        try {
          const metadata = await getProviderMetadata(currentProvider);
          setProviderDefaultModel(metadata.default_model);
        } catch (error) {
          console.error('Failed to get provider default model:', error);
          setProviderDefaultModel(null);
        }
      })();
    } else if (currentModel) {
      setProviderDefaultModel(null);
    }
  }, [currentProvider, currentModel]);

  useEffect(() => {
    if (!currentModel) return;
    setDisplayModelName(getModelDisplayName(currentModel));
  }, [currentModel]);

  useEffect(() => {
    setSelectedProvider(currentProvider || '');
    setSelectedModel(currentModel || '');
  }, [currentModel, currentProvider]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [providerDetails, savedEffort] = await Promise.all([
          acpListProviderDetails(),
          acpReadThinkingEffort(),
        ]);
        const configuredProviders = providerDetails.filter((provider) => provider.is_configured);
        const modelResults = await fetchModelsForProviders(configuredProviders);
        if (cancelled) return;

        setProviders(configuredProviders);
        setModels(modelResults.flatMap((result) => result.models ?? []));
        setThinkingEffort(savedEffort ?? 'off');
        setModelLoadError(
          modelResults.every((result) => result.error)
            ? intl.formatMessage(i18n.modelLoadFailed)
            : ''
        );
        setSelectedProvider((provider) => provider || configuredProviders[0]?.name || '');
      } catch {
        if (!cancelled) setModelLoadError(intl.formatMessage(i18n.modelLoadFailed));
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [intl]);

  const resolvedDisplayModelName = useMemo(
    () => (resolvedModel ? getModelDisplayName(resolvedModel) : null),
    [resolvedModel]
  );

  const selectedProviderModels = models.filter((model) => model.provider === selectedProvider);
  const selectedModelDetails = selectedProviderModels.find((model) => model.name === selectedModel);

  const applyModelSelection = async () => {
    if (!selectedProvider || !selectedModel) return;

    setApplyingModel(true);
    const effort = selectedModelDetails?.reasoning ? thinkingEffort : undefined;
    const model: Model = {
      name: selectedModel,
      provider: selectedProvider,
      reasoning: selectedModelDetails?.reasoning,
      request_params: effort ? { thinking_effort: effort } : undefined,
    };
    if (effort) {
      await acpSaveThinkingEffort(effort).catch(console.warn);
    }
    const success = await changeModel(sessionId, model);
    setApplyingModel(false);
    if (!success) return;

    onModelChanged({ model: selectedModel, provider: selectedProvider });
    trackModelChanged(selectedProvider, selectedModel);
    setMenuOpen(false);
  };

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger className="flex items-center hover:cursor-pointer max-w-[180px] md:max-w-[200px] lg:max-w-[380px] min-w-0 text-text-primary/70 hover:text-text-primary transition-colors">
          <div className="flex items-center truncate max-w-[130px] md:max-w-[200px] lg:max-w-[360px] min-w-0">
            <Bot className="mr-1 h-4 w-4 flex-shrink-0" />
            {isModelLoading ? (
              <span
                data-testid="model-loading-state"
                className="inline-flex items-center gap-1 truncate text-xs"
              >
                <LoaderCircle className="h-3 w-3 animate-spin flex-shrink-0" />
                <span className="truncate">{triggerLabel}</span>
              </span>
            ) : (
              <span className="truncate text-xs">{triggerLabel}</span>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="center"
          className="w-[360px] overflow-hidden p-0 text-sm"
          data-feedback-id="compact-model-selector"
        >
          <div className="border-b border-border-primary px-4 py-3">
            <p className="text-xs text-text-secondary">{intl.formatMessage(i18n.currentModel)}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-text-primary">
              {menuModelLabel}
              {!isModelLoading && displayProvider && ` — ${displayProvider}`}
            </p>
          </div>
          {shouldShowResolvedModel && resolvedDisplayModelName && (
            <div className="border-b border-border-primary px-4 py-2">
              <h6 className="text-xs text-text-primary">
                {intl.formatMessage(i18n.resolvedModel)}
              </h6>
              <p className="text-xs text-text-primary truncate" title={resolvedModel ?? undefined}>
                {resolvedDisplayModelName}
              </p>
            </div>
          )}

          <div className="space-y-4 p-4">
            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {intl.formatMessage(i18n.provider)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      selectedProvider === provider.name
                        ? 'border-purple-500 bg-purple-500/15 text-purple-500'
                        : 'border-border-primary text-text-secondary hover:bg-background-secondary hover:text-text-primary'
                    }`}
                    onClick={() => {
                      setSelectedProvider(provider.name);
                      setSelectedModel(
                        models.find((model) => model.provider === provider.name)?.name || ''
                      );
                    }}
                  >
                    {provider.metadata.display_name}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {intl.formatMessage(i18n.model)}
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {loadingModels ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-text-secondary">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    {intl.formatMessage(i18n.loadingModels)}
                  </div>
                ) : modelLoadError ? (
                  <p className="py-3 text-xs text-text-danger">{modelLoadError}</p>
                ) : selectedProviderModels.length === 0 ? (
                  <p className="py-3 text-xs text-text-secondary">
                    {intl.formatMessage(i18n.noModels)}
                  </p>
                ) : (
                  selectedProviderModels.map((model) => (
                    <button
                      key={`${model.provider}:${model.name}`}
                      type="button"
                      className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                        selectedModel === model.name
                          ? 'bg-background-secondary text-text-primary'
                          : 'text-text-secondary hover:bg-background-secondary hover:text-text-primary'
                      }`}
                      onClick={() => setSelectedModel(model.name)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {getModelDisplayName(model.name)}
                      </span>
                      {selectedModel === model.name && (
                        <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-purple-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>

            {selectedModelDetails?.reasoning && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="model-reasoning-effort"
                    className="text-[11px] font-medium uppercase tracking-wide text-text-secondary"
                  >
                    {intl.formatMessage(i18n.reasoningEffort)}
                  </label>
                  <span className="text-xs font-medium capitalize text-purple-500">
                    {thinkingEffort}
                  </span>
                </div>
                <input
                  id="model-reasoning-effort"
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={getThinkingEffortIndex(thinkingEffort)}
                  onChange={(event) =>
                    setThinkingEffort(getThinkingEffortAtIndex(Number(event.target.value)))
                  }
                  className="h-1.5 w-full cursor-pointer accent-purple-600"
                />
                <div className="mt-1 flex justify-between text-[10px] text-text-secondary">
                  {thinkingEfforts.map((effort) => (
                    <span key={effort} className="capitalize">
                      {effort}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="flex justify-end border-t border-border-primary px-4 py-3">
            <button
              type="button"
              disabled={!selectedProvider || !selectedModel || applyingModel}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void applyModelSelection()}
            >
              {applyingModel ? 'Applying…' : intl.formatMessage(i18n.useModel)}
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
