"use client";
import { App, Button, Checkbox } from "antd";

export function BindingHttp1Control({ enabled, channelName, modelName, onChange }: { enabled: boolean; channelName: string; modelName: string; onChange: (enabled: boolean) => void }) {
    const { modal } = App.useApp();
    const description = (
        <div>
            <p>当前渠道：{channelName}</p>
            <p>当前上游模型：{modelName}</p>
            <p>仅此模型在此渠道绑定上的上游API请求使用HTTP/1.1，用于排查或规避HTTP/2并发传输断流。不改变模型能力、生成参数、计费或自动重试，不影响其他绑定，也不能保证解决所有错误。</p>
            <p>关闭后恢复默认协议协商。确认后仍需应用修改并保存更改。</p>
        </div>
    );
    return (
        <>
            <Checkbox
                checked={enabled}
                onChange={(event) => {
                    if (!event.target.checked) {
                        onChange(false);
                        return;
                    }
                    modal.confirm({ title: "启用HTTP/1.1兼容模式？", content: description, okText: "确认启用", cancelText: "取消", onOk: () => onChange(true) });
                }}
            >
                HTTP/1.1兼容模式
            </Checkbox>
            <Button type="text" size="small" aria-label="HTTP/1.1兼容模式说明" onClick={() => modal.info({ title: "HTTP/1.1兼容模式说明", content: description, okText: "知道了" })}>
                ⓘ
            </Button>
        </>
    );
}
