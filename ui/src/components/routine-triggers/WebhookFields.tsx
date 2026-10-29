import { t as uiT } from "@/i18n";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/clipboard";
import { AgentSetupPrompt } from "@/components/AgentSetupPrompt";

export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <code title={value} className="min-w-0 flex-1 truncate text-xs">
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          aria-label={uiT("ui:messages.m_3f3ebff426db5fa6", { v0: (label) })}
          onClick={async () => {
            try {
              await copyTextToClipboard(value);
              setCopied(true);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? uiT("ui:messages.m_8d525e5f158b9afe") : uiT("ui:messages.m_e21f935f11d7e966")}
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            Copy failed. Select and copy the text below.
          </p>
          <textarea
            readOnly
            aria-label={`${label} text`}
            value={value}
            rows={5}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function AgentInstructions({ value }: { value: string }) {
  return (
    <section
      aria-label={uiT("ui:messages.m_dc390e1824d45589")}
      className="space-y-3 rounded-md bg-muted/40 p-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{uiT("ui:messages.m_dc390e1824d45589")}</h2>
        <p className="text-sm text-muted-foreground">
          Give your agent everything it needs to connect this webhook: the URL,
          authentication key, and step-by-step instructions.
        </p>
      </div>
      <AgentSetupPrompt
        prompt={value}
        label="Copy for your agent"
        title="Webhook setup"
        description="Paste this into your agent to connect this webhook to your routine."
      />
    </section>
  );
}
