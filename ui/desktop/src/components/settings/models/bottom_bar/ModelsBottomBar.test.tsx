import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, type RenderOptions, screen, waitFor } from '@testing-library/react';
import ModelsBottomBar from './ModelsBottomBar';
import { IntlTestWrapper } from '../../../../i18n/test-utils';

const renderWithIntl = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...options });

const createDropdownRef = (): React.RefObject<HTMLDivElement> =>
  ({ current: document.createElement('div') }) as React.RefObject<HTMLDivElement>;

let mockCurrentModel: string | null = 'config-model';
let mockCurrentProvider: string | null = 'config-provider';
const mockGetProviders = vi.fn();
const mockOnModelChanged = vi.fn();
const { mockChangeModel, mockSaveThinkingEffort, configuredProviders } = vi.hoisted(() => ({
  mockChangeModel: vi.fn().mockResolvedValue(true),
  mockSaveThinkingEffort: vi.fn().mockResolvedValue(undefined),
  configuredProviders: [
    {
      is_configured: true,
      name: 'codex',
      provider_type: 'Builtin',
      metadata: {
        display_name: 'Codex',
        default_model: 'gpt-5.6',
        known_models: [],
        config_keys: [],
        description: '',
        model_doc_link: '',
        name: 'codex',
      },
    },
    {
      is_configured: true,
      name: 'antigravity',
      provider_type: 'Builtin',
      metadata: {
        display_name: 'Antigravity',
        default_model: 'gemini-3.1-pro-high',
        known_models: [],
        config_keys: [],
        description: '',
        model_doc_link: '',
        name: 'antigravity',
      },
    },
  ],
}));

vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: mockCurrentModel,
    currentProvider: mockCurrentProvider,
    changeModel: mockChangeModel,
  }),
}));

vi.mock('../../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue(configuredProviders),
  acpReadThinkingEffort: vi.fn().mockResolvedValue('medium'),
  acpSaveThinkingEffort: (...args: unknown[]) => mockSaveThinkingEffort(...args),
}));

vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    getProviders: mockGetProviders,
  }),
}));

vi.mock('../modelInterface', () => ({
  getProviderMetadata: vi.fn().mockResolvedValue({ display_name: 'Config Provider' }),
  fetchModelsForProviders: vi.fn().mockResolvedValue([
    {
      provider: configuredProviders[0],
      models: [
        { name: 'gpt-5.6', provider: 'codex', reasoning: true },
        { name: 'gpt-5.5', provider: 'codex', reasoning: true },
      ],
      error: null,
      warning: null,
    },
    {
      provider: configuredProviders[1],
      models: [{ name: 'gemini-3.1-pro-high', provider: 'antigravity', reasoning: true }],
      error: null,
      warning: null,
    },
  ]),
}));

vi.mock('../predefinedModelsUtils', () => ({
  getModelDisplayName: (model: string) => `Display ${model}`,
}));

vi.mock('../../../bottom_menu/BottomMenuAlertPopover', () => ({
  default: () => null,
}));

vi.mock('../../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../localInference/ModelSettingsPanel', () => ({
  ModelSettingsPanel: () => null,
}));

vi.mock('../../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ModelsBottomBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentModel = 'config-model';
    mockCurrentProvider = 'config-provider';
    mockGetProviders.mockResolvedValue([]);
    mockChangeModel.mockResolvedValue(true);
  });

  it('shows a loading placeholder while the active session model is still loading', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        onModelChanged={mockOnModelChanged}
        sessionLoaded={false}
      />
    );

    expect(screen.getByTestId('model-loading-state')).toHaveTextContent('Loading model...');
  });

  it('shows the active session model once the session has loaded', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        sessionModel="session-model"
        sessionProvider="session-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    expect(screen.getByText('session-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('shows the configured model when there is no active session', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId={null}
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        onModelChanged={mockOnModelChanged}
      />
    );

    expect(screen.getByText('config-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('selects provider, model, and reasoning effort in the same menu', async () => {
    mockCurrentModel = 'gpt-5.6';
    mockCurrentProvider = 'codex';
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        sessionModel="gpt-5.6"
        sessionProvider="codex"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    expect(await screen.findByRole('button', { name: 'Antigravity' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Antigravity' }));
    expect(screen.getByRole('button', { name: 'Display gemini-3.1-pro-high' })).toBeVisible();
    fireEvent.change(screen.getByRole('slider', { name: 'Reasoning effort' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use model' }));

    await waitFor(() =>
      expect(mockChangeModel).toHaveBeenCalledWith('session-123', {
        name: 'gemini-3.1-pro-high',
        provider: 'antigravity',
        reasoning: true,
        request_params: { thinking_effort: 'high' },
      })
    );
    expect(mockOnModelChanged).toHaveBeenCalledWith({
      model: 'gemini-3.1-pro-high',
      provider: 'antigravity',
    });
  });
});
