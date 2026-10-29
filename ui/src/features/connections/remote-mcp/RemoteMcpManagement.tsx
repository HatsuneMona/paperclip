import { t as uiT } from "@/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

/** Shared by the saved connection and its interactive review stories. */
export function RemoteMcpManagement({ providerName, connected = true, canReconnect = true, canDisconnect = true, busy = false, onReconnect, onManage, onDisconnect }: {
  providerName: string;
  connected?: boolean;
  canReconnect?: boolean;
  canDisconnect?: boolean;
  busy?: boolean;
  onReconnect: () => void;
  onManage: () => void;
  onDisconnect: () => void | Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  return <section className="space-y-4">
    <h2 className="text-sm font-semibold">{uiT("ui:messages.m_b4ddb3c1ca6cd289")}</h2>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={!canReconnect || busy} onClick={onReconnect}>{uiT("ui:messages.m_bf8a9eab9e7e141b")}</Button>
      <Button variant="outline" onClick={onManage}>Manage in {providerName}</Button>
      {connected && canDisconnect && <AlertDialog open={confirming} onOpenChange={(open) => { if (!busy) setConfirming(open); }}>
        <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive">{uiT("ui:messages.m_acfc5be785a9bb3d")}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {providerName}?</AlertDialogTitle>
            <AlertDialogDescription>Delete this connection’s saved credentials and stop further calls through Paperclip. Other connections are unaffected. Actions already sent to the provider may still complete. Connecting again requires a new sign-in or key.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{uiT("ui:messages.m_19766ed6ccb2f4a3")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={async (event) => {
              event.preventDefault();
              try { await onDisconnect(); setConfirming(false); } catch { /* The controller displays the failure. */ }
            }}>{busy ? uiT("ui:messages.m_cb2b6a572a8588d8") : "Disconnect connection"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  </section>;
}
