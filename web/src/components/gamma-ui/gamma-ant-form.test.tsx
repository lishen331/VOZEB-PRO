import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Form, FormStore, FormValidationError } from "./gamma-ant-form";
import { Input } from "./gamma-ant-input";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/*
 * 兼容层契约：页面只换 import，调用代码一行不动。
 * 这里锁住的是「antd 的实例行为」——setFieldsValue 合并语义、resetFields 回基线、
 * validateFields 的抛出形状、错误显示时机。这些一旦变了，33 个表单页会静默坏掉。
 */
describe("gamma-ant-form：FormStore 实例契约", () => {
    it("setFieldsValue 支持点号路径写入", () => {
        const store = new FormStore({ title: "旧标题", meta: { ratio: "9:16" } });
        store.setFieldsValue({ title: "新标题", "meta.ratio": "16:9" });
        expect(store.getFieldValue("title")).toBe("新标题");
        expect(store.getFieldValue("meta.ratio")).toBe("16:9");
    });

    it("setFieldValue 支持数组路径（Form.List 的 name={[index, key]}）", () => {
        const store = new FormStore({ items: [{ title: "A" }, { title: "B" }] });
        store.setFieldValue(["items", 1, "title"], "B2");
        expect(store.getFieldValue(["items", 1, "title"])).toBe("B2");
        // 不可变写入：同层其它元素不被就地修改
        expect(store.getFieldValue(["items", 0, "title"])).toBe("A");
    });

    it("resetFields 回到 initialValues（不是回空）", () => {
        const store = new FormStore({ title: "初始" });
        store.setFieldsValue({ title: "改过" });
        store.resetFields();
        expect(store.getFieldValue("title")).toBe("初始");
    });

    it("seed 之后 resetFields 回到 seed 的值（initialValues 挂载后灌入的场景）", () => {
        const store = new FormStore();
        store.seed({ kind: "image" });
        store.setFieldsValue({ kind: "video" });
        store.resetFields();
        expect(store.getFieldValue("kind")).toBe("image");
    });

    it("required 校验在提交时抛出 FormValidationError，形状与 antd 一致", async () => {
        const store = new FormStore({ title: "" });
        store.registerField("title", [{ required: true, message: "请输入标题" }], "标题");
        await expect(store.validateFields()).rejects.toBeInstanceOf(FormValidationError);
        const store2 = new FormStore({ title: "" });
        store2.registerField("title", [{ required: true, message: "请输入标题" }], "标题");
        await expect(store2.validateFields()).rejects.toMatchObject({
            errorFields: [{ name: "title", message: "请输入标题" }],
        });
    });

    it("whitespace 规则把纯空白当作空", async () => {
        const store = new FormStore({ prompt: "   " });
        store.registerField("prompt", [{ required: true, whitespace: true, message: "请填写提示词" }], "提示词");
        await expect(store.validateFields()).rejects.toMatchObject({
            errorFields: [{ name: "prompt", message: "请填写提示词" }],
        });
    });

    it("max 规则：字符串按字符长度、数字按数值", async () => {
        const store = new FormStore({ title: "一二三四五六", count: 20 });
        store.registerField("title", [{ max: 5, message: "标题太长" }], "标题");
        store.registerField("count", [{ max: 10, message: "数值过大" }], "数量");
        await expect(store.validateFields()).rejects.toMatchObject({
            errorFields: [
                { name: "title", message: "标题太长" },
                { name: "count", message: "数值过大" },
            ],
        });
    });

    it("validator 只在提交时跑，不阻塞输入", async () => {
        const validator = vi.fn(() => Promise.reject(new Error("幕索引必须为非负整数")));
        const store = new FormStore({ index: "abc" });
        store.registerField("index", [{ validator }], "幕索引");
        store.setFieldValue("index", "def");
        expect(validator).not.toHaveBeenCalled();
        await expect(store.validateFields()).rejects.toMatchObject({
            errorFields: [{ name: "index", message: "幕索引必须为非负整数" }],
        });
        expect(validator).toHaveBeenCalled();
    });

    it("错误到提交过或字段碰过之后才可见", () => {
        const store = new FormStore({ title: "" });
        store.registerField("title", [{ required: true, message: "请输入标题" }], "标题");
        expect(store.isVisibleError("title")).toBe(false);
        store.setFieldValue("title", "x");
        store.setFieldValue("title", "");
        expect(store.isVisibleError("title")).toBe(true);
    });

    it("isFieldsTouched 区分整体与指定字段", () => {
        const store = new FormStore({ a: "", b: "" });
        expect(store.isFieldsTouched()).toBe(false);
        store.setFieldValue("a", "1");
        expect(store.isFieldsTouched()).toBe(true);
        expect(store.isFieldsTouched(["b"])).toBe(false);
        expect(store.isFieldsTouched(["a"])).toBe(true);
    });

    it("submit 校验通过后才触发 onFinish，并带上整张表单的值", async () => {
        const store = new FormStore({ title: "标题" });
        const onFinish = vi.fn();
        store.setCallbacks(onFinish);
        store.registerField("title", [{ required: true }], "标题");
        store.submit();
        await vi.waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
        expect(onFinish.mock.calls[0][0]).toMatchObject({ title: "标题" });
    });

    it("校验未通过时 submit 不触发 onFinish", async () => {
        const store = new FormStore({ title: "" });
        const onFinish = vi.fn();
        store.setCallbacks(onFinish);
        store.registerField("title", [{ required: true, message: "请输入标题" }], "标题");
        store.submit();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(onFinish).not.toHaveBeenCalled();
    });

    it("订阅者在每次写入后收到通知（Form.Item / useWatch 依赖它重渲染）", () => {
        const store = new FormStore({ a: "" });
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.setFieldValue("a", "1");
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.setFieldValue("a", "2");
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe("gamma-ant-form：渲染结构", () => {
    it("Form 渲染 form 元素与 gm-form 类名，vertical 布局带 gap", () => {
        const markup = html(
            <Form layout="vertical" className="max-w-md">
                <span>字段</span>
            </Form>,
        );
        expect(markup).toContain("<form");
        expect(markup).toContain("gm-form");
        expect(markup).toContain("max-w-md");
        expect(markup).toContain("flex-col");
    });

    it("Form.Item 渲染 label，requiredMark 控制必填星号", () => {
        const marked = html(
            <Form requiredMark>
                <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Form>,
        );
        expect(marked).toContain("标题");
        expect(marked).toContain("gm-danger");

        const unmarked = html(
            <Form requiredMark={false}>
                <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Form>,
        );
        expect(unmarked).not.toContain("gm-danger");
    });

    it("noStyle 不渲染外层包裹，hidden 带 hidden 属性", () => {
        const noStyle = html(
            <Form>
                <Form.Item noStyle name="x">
                    <Input />
                </Form.Item>
            </Form>,
        );
        expect(noStyle).not.toContain("gm-form-item");

        const hidden = html(
            <Form>
                <Form.Item hidden name="x" valuePropName="checked">
                    <Input />
                </Form.Item>
            </Form>,
        );
        expect(hidden).toContain("hidden");
    });

    it("extra 在无错误时作为说明文字渲染", () => {
        const markup = html(
            <Form>
                <Form.Item name="prompt" label="提示词" extra="选择来源后会自动读取">
                    <Input />
                </Form.Item>
            </Form>,
        );
        expect(markup).toContain("选择来源后会自动读取");
    });

    it("Form.List 按数组长度产出行", () => {
        const store = new FormStore({ items: [{ title: "A" }] });
        const markup = html(
            <Form form={{ __store: store } as never}>
                <Form.List name="items">{(fields) => <span data-count={fields.length} />}</Form.List>
            </Form>,
        );
        expect(markup).toContain('data-count="1"');
    });

    it("Form.Item 的 render-prop 形态能读到 getFieldValue", () => {
        const store = new FormStore({ items: [{ kind: "image" }] });
        const markup = html(
            <Form form={{ __store: store } as never}>
                <Form.Item shouldUpdate noStyle>
                    {({ getFieldValue }) => <span data-kind={String(getFieldValue(["items", 0, "kind"]))} />}
                </Form.Item>
            </Form>,
        );
        expect(markup).toContain('data-kind="image"');
    });
});
