# 生产环境接入兔子 / ModelBay 图片与视频模型执行文档

2026-10-07 · 目标：2026-10-08 课堂前上线 · 生产站点 https://gammatv.gammablue-x.com/

## 1. 目标与范围

只在生产环境接入并启用下面这些模型，其余模型一律不启用：

| 渠道 | 能力 | 上游模型 | 模型级协议 |
|---|---|---|---|
| 兔子 | 图片 | `gpt-image-2`、`gpt-image-2.5-sunburst` | 沿用渠道（OpenAI 图片接口） |
| 兔子 | 视频 | `doubao-seedance-2-0-260128`、`doubao-seedance-2-5-260628` | `tuzi-seedance` |
| ModelBay | 图片 | `gpt-image-2-text-to-image`、`gpt-image-2-image-to-image`、`gpt-image-2-5-flare`、`gpt-image-2-5-sunburst` | 沿用渠道（OpenAI 图片接口） |
| ModelBay | 视频 | `official/seedance-2`、`official/seedance-2-5` | `modelbay-seedance` |

不在范围内：兔子和 ModelBay 的 fast、mini、`bytedance/*` 以及其他目录模型；现有 4 个生产渠道的配置和优先级不改。

## 2. 生产现状（2026-10-07 只读核查）

- 服务器 `8.163.33.161`，目录 `/opt/vozeb-pro/production`，容器为 `vozeb-pro`、`vozeb-pro-generation-worker` 和 `vozeb-pro-postgres`。
- 运行镜像 `sha-4eebaddd`，即 v0.8.1（v0.8.2 标签指向同一个提交）。
- 渠道只有 4 个：模汇 gpt 文本、昱梦、RunningHub、模汇 API。没有兔子和 ModelBay。`settings_revision` 为 72，共 48 个逻辑模型。
- 生产代码不包含今天的 3 个修复：61045e4f（兔子请求构建和素材服务）、58940fe9（本地地址跳过入库）、919980f1（协议白名单）。
- 发布方式：`.github/workflows/production-image.yml` 在推送 `vX.Y.Z` 标签时触发。标签所在提交必须已经在 `main` 上。工作流负责构建、拉取、切换镜像和健康检查，健康检查失败会自动回滚到旧镜像。

## 3. 前置条件（缺一项就不开始）

1. 兔子和 ModelBay 的 API Key 来源已确定：沿用 staging 渠道里的 Key，或者你另外提供生产 Key。两个环境的加密密钥不同，staging 的密文不能直接复制。迁移时在 staging 容器内解密，通过管道传到生产容器，再用生产密钥加密写入，明文不落盘、不打印。
2. 兔子生产 Key 要开通素材能力，并且是单分组令牌。验证方法：`GET https://api.tu-zi.com/v1/seedance/assets` 返回 `success:true`。如果返回“当前令牌未配置可用素材适配器”，真人视频会失败，参考图会退回直传。
3. 确认发布范围（见第 4 节第 1 步）。
4. 生产数据库已备份（第 4 节第 2 步）。

## 4. 执行步骤

### 第 1 步：确定发布内容

develop 比 main 多 6 个提交：3 个是我们的修复，另外 3 个是画布改动（ef8f50d0、362df6cb、9dc3269e）。staging 是把这 6 个一起测的。

- 方案 A（推荐）：把整个 develop 合入 main。上线后生产代码与 staging 当前版本（919980f1）一致，另外带上 main 上已有的生产发布脚本修复（只影响 CI，不影响功能）。
- 方案 B：只把 3 个兔子/ModelBay 修复 cherry-pick 到 main，不带 3 个画布改动。这个组合没在 staging 测过。
- 待你选定。

### 第 2 步：备份生产数据库

```bash
ssh -i <生产私钥> -o IdentitiesOnly=yes -p 22222 root@8.163.33.161
cd /opt/vozeb-pro/production
docker exec vozeb-pro-postgres pg_dump -U vozeb_pro -d vozeb_pro -Fc > backups/vozeb_pro-before-v0.8.3-$(date +%Y%m%dT%H%M%S).dump
ls -la backups/
```

### 第 3 步：发布 v0.8.3

```bash
git checkout main && git pull
git merge --no-ff origin/develop -m "release: promote tested develop for v0.8.3"
# 解决冲突时保留 main 上的生产 CI 修复（6f427831、f5cc0174）
git push origin main
git tag v0.8.3 && git push origin v0.8.3
```

在 GitHub Actions 的 Production image 里看运行结果，以往大约要 50 到 70 分钟。

### 第 4 步：确认部署成功

```bash
docker ps --format "{{.Names}} {{.Image}} {{.Status}}"   # 镜像应为 sha-<v0.8.3 提交>
curl --fail http://127.0.0.1:3000/api/health/ready
docker logs --since 10m vozeb-pro 2>&1 | grep -iE "error|fatal" | tail
```

### 第 5 步：新建两个渠道（我用脚本写库）

由我直接写生产库：在一个事务里插入两个渠道，加密 API Key，校验 `settings_revision` 没被并发修改。改完后后台页面就能看到，效果与下面的手动配置相同。手动配置的要点保留如下，供核对：

兔子渠道：
- Base URL 填 `https://api.tu-zi.com/`，渠道协议选 `newapi`，填入 API Key。
- 模型列表只保留第 1 节里的 4 个，不要导入整个目录。兔子目录有 600 多个模型，全部导入会生成大量逻辑模型。
- 在模型配置里，把两个 Seedance 模型的协议改成“兔子 Seedance 真人协议”。两个图片模型保持“沿用渠道”。

ModelBay 渠道：
- Base URL 填 `https://api.modelbay.io/`，渠道协议选 `newapi`，填入 API Key。
- 模型列表只保留第 1 节里的 6 个。
- 在模型配置里，把两个 `official/seedance-*` 的协议改成“ModelBay 官方 Seedance”。4 个图片模型保持“沿用渠道”。

不要把渠道级协议改成 Seedance 协议，否则图片模型也会走视频接口。

### 第 6 步：逻辑模型绑定

- 只启用第 1 节里 10 个上游模型的绑定。保存后，用第 7 节的查询确认没有多出其他启用的绑定。
- 如果 `gpt-image-2` 等逻辑模型在生产上已经绑定了模汇渠道，原来的优先级保持不变，兔子和 ModelBay 的绑定排在后面，作为故障转移。
- 并发：课堂有 80 人，需要给兔子和 ModelBay 的视频绑定设并发上限，具体数值按两家给的限流来定。
- 保存时可能提示“尚无成功生成记录”。这只是提醒，不影响保存和使用。

### 第 7 步：只读核对（我来执行）

```sql
select key, value->>'protocol', value->>'createPath'
from vozeb_pro_system_model_channels, jsonb_each(advanced_config->'modelConfigs')
where key in ('doubao-seedance-2-0-260128','doubao-seedance-2-5-260628','official/seedance-2','official/seedance-2-5');

select m->>'id', b->>'channelId', b->>'upstreamModel'
from vozeb_pro_app_settings s, jsonb_array_elements(s.logical_models) m, jsonb_array_elements(m->'bindings') b
where s.id = 'default' and (b->>'enabled')::boolean
  and b->>'channelId' in ('<兔子渠道ID>','<ModelBay渠道ID>');
```

期望结果：4 个 Seedance 模型的协议分别是 `tuzi-seedance` 和 `modelbay-seedance`；启用的绑定正好 10 条。

### 第 8 步：生产验收（少量真实调用，会产生费用）

| 用例 | 兔子 | ModelBay |
|---|---|---|
| Seedance 2：无参考 | ☐ | ☐ |
| Seedance 2：真人参考图 | ☐ | ☐ |
| Seedance 2.5：真人参考图 | ☐ | ☐ |
| GPT image 2：文生图 / 图生图 | ☐ | ☐ |
| GPT image 2.5：文生图 | ☐ | ☐ |

只用一个账号逐条测试，不在生产上做压测。如果有失败，记下节点 ID，我去查 `vozeb_pro_generation_tasks`。

## 5. 回滚

- 配置问题：在后台关闭对应的绑定或渠道，立即生效，不影响原有 4 个渠道。
- 代码问题：在 Production image 里用 `workflow_dispatch` 重新部署 `release_tag=v0.8.1`。
- 数据问题：用第 2 步的备份执行 `pg_restore`。需要停机，做之前先确认。

## 6. 角色分工

- 你：确认 Key 来源，做第 8 步验收。
- 我：执行第 2 到第 7 步（备份、发布、新建渠道、绑定、核对），以及失败排查。
