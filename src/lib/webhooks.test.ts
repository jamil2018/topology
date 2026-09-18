import { describe, expect, it } from "vitest";
import { webhookUrlError } from "./webhooks";

describe("webhookUrlError", () => {
  it("rejects non-http schemes and local or private targets", () => {
    expect(webhookUrlError("javascript:alert(1)")).toBeTruthy();
    expect(webhookUrlError("file:///etc/passwd")).toBeTruthy();
    expect(webhookUrlError("http://127.0.0.1:9/hook")).toBeTruthy();
    expect(webhookUrlError("http://localhost/hook")).toBeTruthy();
    expect(webhookUrlError("http://[::1]/hook")).toBeTruthy();
    expect(webhookUrlError("http://169.254.169.254/latest")).toBeTruthy();
    expect(webhookUrlError("http://10.1.2.3/hook")).toBeTruthy();
    expect(webhookUrlError("http://172.16.0.5/hook")).toBeTruthy();
    expect(webhookUrlError("http://192.168.1.20/hook")).toBeTruthy();
    expect(webhookUrlError("http://[::ffff:127.0.0.1]/hook")).toBeTruthy();
  });

  it("allows public http(s) URLs", () => {
    expect(webhookUrlError("https://example.com/hooks/topology")).toBeNull();
    expect(webhookUrlError("http://172.32.0.1/hook")).toBeNull();
    expect(webhookUrlError("https://8.8.8.8/hook")).toBeNull();
  });
});
