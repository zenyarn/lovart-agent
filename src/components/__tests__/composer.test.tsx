// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  act,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../composer";
vi.mock("../model-icon", () => ({ ModelIcon: () => null }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());
it("requires prompt and sends trimmed input exactly once", async () => {
  const send = vi.fn().mockResolvedValue(undefined),
    user = userEvent.setup();
  render(<Composer onSend={send} />);
  const button = screen.getByRole("button", {
    name: "发送生成请求",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await user.type(
    screen.getByRole("textbox", { name: "生图提示词" }),
    " blue cup ",
  );
  await user.click(button);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({
    prompt: "blue cup",
    settings: { model: "nano", resolution: "1K", ratio: "1:1" },
  });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
});
it("does not send Enter while composing or Shift+Enter", () => {
  const send = vi.fn();
  render(<Composer onSend={send} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "陶瓷杯" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(send).not.toHaveBeenCalled();
});
it("keeps draft and idempotency key when submission response is lost", async () => {
  const send = vi.fn().mockRejectedValue(new Error("网络中断")),
    user = userEvent.setup();
  render(<Composer onSend={send} />);
  await user.type(screen.getByRole("textbox"), "cup");
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0].requestKey).toBe(
    send.mock.calls[1][0].requestKey,
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "cup",
  );
});
it("reflects Nano resolution and ratio selection in toolbar", async () => {
  const user = userEvent.setup();
  render(<Composer onSend={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "1K · 1:1" }));
  await user.click(screen.getByRole("button", { name: "2K" }));
  await user.click(screen.getByRole("button", { name: "16:9" }));
  expect(screen.getByRole("button", { name: "2K · 16:9" })).toBeTruthy();
});
it("allows only one selected canvas reference and removal", async () => {
  const user = userEvent.setup();
  render(
    <Composer
      onSend={vi.fn()}
      selectedReference={{
        id: "asset",
        url: "https://example.com/a.png",
        width: 1,
        height: 1,
        mime: "image/png",
      }}
    />,
  );
  await waitFor(() => expect(screen.getAllByAltText("参考图")).toHaveLength(1));
  await user.click(screen.getByTitle("移除参考图"));
  expect(screen.queryByAltText("参考图")).toBeNull();
});
it("disables unsupported GPT combinations after changing resolution", async () => {
  const user = userEvent.setup();
  render(<Composer onSend={vi.fn()} />);
  await user.click(screen.getByTitle("切换生图模型"));
  await user.click(screen.getByRole("button", { name: "GPT Image2" }));
  await user.click(screen.getByRole("button", { name: "1K · 1:1" }));
  await user.click(screen.getByRole("button", { name: "5:4" }));
  await user.click(screen.getByRole("button", { name: "2K" }));
  await user.type(screen.getByRole("textbox"), "cup");
  expect(
    (screen.getByRole("button", { name: "发送生成请求" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/当前分辨率不支持/)).toBeTruthy();
});
it("restores the exact model and configuration after a lost submission response", async () => {
  const send = vi.fn().mockRejectedValue(new Error("网络中断"));
  const user = userEvent.setup();
  const first = render(<Composer onSend={send} projectId="restore-test" />);
  await user.click(screen.getByTitle("切换生图模型"));
  await user.click(screen.getByRole("button", { name: "GPT Image2" }));
  await user.click(screen.getByRole("button", { name: "1K · 1:1" }));
  await user.click(screen.getByRole("button", { name: "2K" }));
  await user.click(screen.getByRole("button", { name: "16:9" }));
  await user.type(screen.getByRole("textbox"), "cup");
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  await screen.findByRole("alert");
  first.rerender(
    <Composer
      onSend={send}
      projectId="restore-test"
      externalSettings={{
        nano: { model: "nano", resolution: "4K", ratio: "16:9" },
      }}
    />,
  );
  first.unmount();
  render(<Composer onSend={send} projectId="restore-test" />);
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
});
it("persists a canvas reference even before editing the prompt", async () => {
  render(
    <Composer
      onSend={vi.fn()}
      projectId="reference-test"
      selectedReference={{
        id: "chosen",
        url: "https://example.com/a.png",
        width: 1,
        height: 1,
        mime: "image/png",
      }}
    />,
  );
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("lovart-draft:reference-test") || "{}")
        .referenceId,
    ).toBe("chosen"),
  );
});
it("keeps prompt and file controls disabled until client handlers are hydrated", async () => {
  const { renderToString } = await import("react-dom/server");
  const html = renderToString(<Composer onSend={vi.fn()} />);
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(root.querySelector("textarea")!.disabled).toBe(true);
  expect(root.querySelector("input[type=file]")!.hasAttribute("disabled")).toBe(
    true,
  );
  render(<Composer onSend={vi.fn()} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
    false,
  );
});
it("blocks sending until a saved reference is recovered and keeps recovery failure visible", async () => {
  const { api } = await import("@/lib/client-api");
  let reject!: (e: Error) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      }),
  );
  localStorage.setItem(
    "lovart-draft:pending-reference",
    JSON.stringify({ prompt: "edit cup", referenceId: "asset" }),
  );
  const send = vi.fn();
  render(<Composer onSend={send} projectId="pending-reference" />);
  expect(
    (screen.getByRole("button", { name: "发送生成请求" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => reject(new Error("offline")));
  expect(screen.getByRole("alert").textContent).toContain("参考图");
  expect(
    (screen.getByRole("button", { name: "发送生成请求" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: "移除未恢复参考图" }),
  );
  expect(
    (screen.getByRole("button", { name: "发送生成请求" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("locks editing while a submission is in flight", async () => {
  let finish!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Composer onSend={send} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "first");
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
    true,
  );
  await act(async () => finish());
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
    false,
  );
});
it("adopts remote project settings without replacing an unresolved submission snapshot", async () => {
  const view = render(<Composer onSend={vi.fn()} />);
  view.rerender(
    <Composer
      onSend={vi.fn()}
      externalSettings={{
        nano: { model: "nano", resolution: "4K", ratio: "16:9" },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "4K · 16:9" })).toBeTruthy();
});
it("locks prompt edits during upload and preserves the current draft when upload completes", async () => {
  const { api } = await import("@/lib/client-api");
  let finish!: (v: unknown) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Composer onSend={vi.fn()} projectId="upload-draft" />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "keep this prompt");
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(
    input,
    new File(["png"], "test.png", { type: "image/png" }),
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
    true,
  );
  await act(async () =>
    finish({
      asset: {
        id: "uploaded",
        url: "https://example.com/image.png",
        width: 1,
        height: 1,
        mime: "image/png",
      },
    }),
  );
  expect(
    JSON.parse(localStorage.getItem("lovart-draft:upload-draft")!),
  ).toMatchObject({ prompt: "keep this prompt", referenceId: "uploaded" });
});
it("switches the shared input to Agent using keyboard and hides manual configuration", async () => {
  const user = userEvent.setup();
  render(
    <Composer projectId="agent-test" onSend={vi.fn()} onAgentSend={vi.fn()} />,
  );
  const mode = screen.getByRole("button", { name: "模式：生图" });
  await user.click(mode);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByText("Agent自动规划")).toBeTruthy();
  expect(screen.queryByTitle("切换生图模型")).toBeNull();
  expect(screen.queryByRole("button", { name: "1K · 1:1" })).toBeNull();
});
it("clears Agent text immediately while the submission is pending", async () => {
  const user = userEvent.setup();
  let resolve!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  render(
    <Composer projectId="agent-clear" onSend={vi.fn()} onAgentSend={send} />,
  );
  await user.click(screen.getByRole("button", { name: "模式：生图" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Agent" }));
  await user.type(screen.getByRole("textbox"), "make coffee");
  await user.click(screen.getByRole("button", { name: "发送生成请求" }));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  expect(
    (screen.getByRole("button", { name: "模式：Agent" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => resolve());
});
it('accepts dropped Markdown and pasted image files through the shared attachment path', async () => {
  const {api}=await import('@/lib/client-api');
  vi.mocked(api).mockResolvedValueOnce({asset:{id:'md',name:'brief.md',mime:'text/markdown',url:'/md',width:0,height:0}}).mockResolvedValueOnce({asset:{id:'img',mime:'image/png',url:'/img',width:10,height:20}});
  const send=vi.fn().mockResolvedValue(undefined);
  const user=userEvent.setup();
  render(<Composer projectId="drop-paste" onSend={vi.fn()} onAgentSend={send}/>);
  await user.click(screen.getByRole('button',{name:'模式：生图'}));
  await user.click(screen.getByRole('menuitemradio',{name:'Agent'}));
  fireEvent.drop(screen.getByRole('textbox'),{dataTransfer:{files:[new File(['# article'],'brief.md',{type:'text/markdown'})]}});
  await waitFor(()=>expect(screen.getByText('brief.md')).toBeTruthy());
  fireEvent.paste(screen.getByRole('textbox'),{clipboardData:{files:[new File(['png'],'photo.png',{type:'image/png'})]}});
  await waitFor(()=>expect(screen.getByAltText('图1')).toBeTruthy());
  await user.type(screen.getByRole('textbox'),'use both');
  await user.click(screen.getByRole('button',{name:'发送生成请求'}));
  expect(send.mock.calls[0][0].attachments.map((a:{id:string})=>a.id)).toEqual(['md','img']);
  expect(screen.queryByText('brief.md')).toBeNull();
  expect(screen.queryByAltText('图1')).toBeNull();
});
