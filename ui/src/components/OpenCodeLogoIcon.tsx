import { t as uiT } from "@/i18n";
import { cn } from "../lib/utils";

interface OpenCodeLogoIconProps {
  className?: string;
}

export function OpenCodeLogoIcon({ className }: OpenCodeLogoIconProps) {
  return (
    <>
      <img
        src="/brands/opencode-logo-light-square.svg"
        alt={uiT("ui:messages.m_3af0e55ccc96d87c")}
        className={cn("dark:hidden", className)}
      />
      <img
        src="/brands/opencode-logo-dark-square.svg"
        alt={uiT("ui:messages.m_3af0e55ccc96d87c")}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
