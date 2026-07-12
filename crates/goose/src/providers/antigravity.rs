use anyhow::Result;
use async_trait::async_trait;
use futures::future::BoxFuture;
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use goose_providers::errors::ProviderError;
use goose_providers::model::ModelConfig;
use rmcp::model::{Role, Tool};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

use super::base::{
    current_working_dir, stream_from_single_message, ConfigKey, MessageStream, Provider,
    ProviderDef, ProviderMetadata,
};
use super::utils::filter_extensions_from_system_prompt;
use crate::config::search_path::SearchPaths;
use crate::config::{Config, ExtensionConfig, GooseMode};
use crate::conversation::message::{Message, MessageContent};
use crate::subprocess::configure_subprocess;

const ANTIGRAVITY_PROVIDER_NAME: &str = "antigravity";
pub const ANTIGRAVITY_DEFAULT_MODEL: &str = "Gemini 3.5 Flash (Medium)";
pub const ANTIGRAVITY_KNOWN_MODELS: &[&str] = &[
    "Gemini 3.5 Flash (Medium)",
    "Gemini 3.5 Flash (High)",
    "Gemini 3.5 Flash (Low)",
    "Gemini 3.1 Pro (High)",
    "Gemini 3.1 Pro (Low)",
    "Claude Opus 4.6 (Thinking)",
    "Claude Sonnet 4.6 (Thinking)",
    "GPT-OSS 120B (Medium)",
];
pub const ANTIGRAVITY_DOC_URL: &str = "https://antigravity.google/docs";

#[derive(Debug, serde::Serialize)]
pub struct AntigravityProvider {
    command: PathBuf,
    working_dir: PathBuf,
    #[serde(skip)]
    name: String,
}

impl AntigravityProvider {
    async fn from_env_with_dir(working_dir: PathBuf) -> Result<Self> {
        let config = Config::global();
        let command: String = config.get_agy_command().unwrap_or_default().into();
        let resolved_command = SearchPaths::builder().with_npm().resolve(command)?;

        Ok(Self {
            command: resolved_command,
            working_dir,
            name: ANTIGRAVITY_PROVIDER_NAME.to_string(),
        })
    }

    fn build_prompt(system: &str, messages: &[Message]) -> String {
        let filtered_system = filter_extensions_from_system_prompt(system);
        let mut prompt = String::new();

        if !filtered_system.is_empty() {
            prompt.push_str("System instructions:\n");
            prompt.push_str(&filtered_system);
            prompt.push_str("\n\n");
        }

        prompt.push_str("Conversation so far:\n");
        for message in messages {
            let role = match message.role {
                Role::User => "User",
                Role::Assistant => "Assistant",
            };
            let text = message.as_concat_text();
            if text.trim().is_empty() {
                continue;
            }
            prompt.push_str(role);
            prompt.push_str(":\n");
            prompt.push_str(&text);
            prompt.push_str("\n\n");
        }

        prompt.push_str(
            "Continue from this conversation context. Use the configured workspace directory for any file operations.",
        );
        prompt
    }

    fn apply_mode_flags(cmd: &mut Command) {
        let goose_mode = Config::global().get_goose_mode().unwrap_or(GooseMode::Auto);
        match goose_mode {
            GooseMode::Auto => {
                cmd.arg("--mode")
                    .arg("accept-edits")
                    .arg("--dangerously-skip-permissions");
            }
            GooseMode::SmartApprove | GooseMode::Approve => {
                cmd.arg("--mode").arg("accept-edits");
            }
            GooseMode::Chat => {
                cmd.arg("--mode").arg("plan");
            }
        }
    }

    async fn execute_command(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
    ) -> Result<String, ProviderError> {
        let prompt = Self::build_prompt(system, messages);
        let mut cmd = Command::new(&self.command);
        configure_subprocess(&mut cmd);

        if let Ok(path) = SearchPaths::builder().with_npm().path() {
            cmd.env("PATH", path);
        }

        Self::apply_mode_flags(&mut cmd);
        cmd.arg("--add-dir")
            .arg(&self.working_dir)
            .arg("--model")
            .arg(&model_config.model_name)
            .arg("--print-timeout")
            .arg("10m")
            .arg("--print")
            .arg(prompt)
            .current_dir(&self.working_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.kill_on_drop(true).output().await.map_err(|e| {
            ProviderError::RequestFailed(format!(
                "Failed to spawn Antigravity CLI command '{}': {e}. Make sure the Antigravity CLI is installed and available in PATH.",
                self.command.display()
            ))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                format!("exit code {:?}", output.status.code())
            };
            return Err(ProviderError::RequestFailed(format!(
                "Antigravity CLI command failed: {detail}"
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

impl goose_providers::base::ProviderDescriptor for AntigravityProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            ANTIGRAVITY_PROVIDER_NAME,
            "Antigravity",
            "Execute Google's Antigravity CLI models, including Gemini and Claude Opus variants.",
            ANTIGRAVITY_DEFAULT_MODEL,
            ANTIGRAVITY_KNOWN_MODELS.to_vec(),
            ANTIGRAVITY_DOC_URL,
            vec![ConfigKey::new(
                "AGY_COMMAND",
                true,
                false,
                Some("agy"),
                true,
            )],
        )
    }
}

impl ProviderDef for AntigravityProvider {
    type Provider = Self;

    fn from_env(
        _extensions: Vec<ExtensionConfig>,
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(Self::from_env_with_dir(current_working_dir()))
    }

    fn from_env_with_working_dir(
        _extensions: Vec<ExtensionConfig>,
        working_dir: PathBuf,
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(Self::from_env_with_dir(working_dir))
    }
}

#[async_trait]
impl Provider for AntigravityProvider {
    fn get_name(&self) -> &str {
        &self.name
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        Ok(ANTIGRAVITY_KNOWN_MODELS
            .iter()
            .map(|s| s.to_string())
            .collect())
    }

    fn skip_canonical_filtering(&self) -> bool {
        true
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        _tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        if super::cli_common::is_session_description_request(system) {
            let (message, provider_usage) = super::cli_common::generate_simple_session_description(
                &model_config.model_name,
                messages,
            )?;
            return Ok(stream_from_single_message(message, provider_usage));
        }

        let text = self.execute_command(model_config, system, messages).await?;
        let mut message = Message::new(
            Role::Assistant,
            chrono::Utc::now().timestamp(),
            vec![MessageContent::text(text)],
        );
        message.id = Some(uuid::Uuid::new_v4().to_string());

        Ok(stream_from_single_message(
            message,
            ProviderUsage::new(model_config.model_name.clone(), Usage::default()),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose_providers::base::ProviderDescriptor;

    #[test]
    fn metadata_exposes_antigravity_models() {
        let metadata = AntigravityProvider::metadata();
        assert_eq!(metadata.name, "antigravity");
        assert_eq!(metadata.default_model, "Gemini 3.5 Flash (Medium)");
        assert!(metadata
            .known_models
            .iter()
            .any(|model| model.name == "Claude Opus 4.6 (Thinking)"));
        assert!(metadata
            .known_models
            .iter()
            .any(|model| model.name == "Gemini 3.5 Flash (High)"));
    }

    #[test]
    fn build_prompt_includes_transcript_context() {
        let messages = vec![
            Message::new(
                Role::User,
                0,
                vec![MessageContent::text("Remember TOKEN_123")],
            ),
            Message::new(Role::Assistant, 0, vec![MessageContent::text("Noted")]),
            Message::new(Role::User, 0, vec![MessageContent::text("Repeat it")]),
        ];

        let prompt = AntigravityProvider::build_prompt("You are precise.", &messages);

        assert!(prompt.contains("You are precise."));
        assert!(prompt.contains("User:\nRemember TOKEN_123"));
        assert!(prompt.contains("Assistant:\nNoted"));
        assert!(prompt.contains("User:\nRepeat it"));
    }
}
