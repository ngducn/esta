import { slotPorts } from './slot.ts';

export type CaddyInput = {
  lan: string;
  slot: number;
  certFile: string;
  keyFile: string;
  publicDir: string;
};

export function renderCaddyfile(template: string, { lan, slot, certFile, keyFile, publicDir }: CaddyInput): string {
  const ports = slotPorts(slot);
  const values: Record<string, string> = {
    LAN: lan,
    CERT_FILE: certFile,
    KEY_FILE: keyFile,
    PUBLIC_DIR: publicDir,
    WEB_PORT: String(ports.web),
    API_PORT: String(ports.api),
    INBUCKET_PORT: String(ports.inbucket),
    WEB_LAN_PORT: String(ports.webLan),
    API_LAN_PORT: String(ports.apiLan),
    INBUCKET_LAN_PORT: String(ports.inbucketLan),
  };
  return template.replaceAll(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Caddyfile template has an unknown placeholder ${placeholder}`);
    return value;
  });
}
