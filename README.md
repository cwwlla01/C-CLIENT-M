# C-CLIENT-M

`C-CLIENT-M` 是 `C-CLIENT` 的移动端监督前端，面向主管 / 调度者使用。

它聚焦公司维度的移动监督能力：

- 首页监督总览
- 员工列表与员工详情抽屉
- 审核消息处理
- 任务中心与固定主动作
- 发布任务弹层
- Light / Dark 双主题

执行端、bridge、本地运行时宿主、项目空间管理等核心能力开源在：

- [C-CLIENT](https://github.com/cwwlla01/C-CLIENT)

相关文档可直接参考：

- [C-CLIENT / docs / docker-podman.md](https://github.com/cwwlla01/C-CLIENT/blob/main/docs/docker-podman.md)
- [C-CLIENT / docs / local-api-reference.md](https://github.com/cwwlla01/C-CLIENT/blob/main/docs/local-api-reference.md)
- [C-CLIENT / docs / mvp-current-state.md](https://github.com/cwwlla01/C-CLIENT/blob/main/docs/mvp-current-state.md)
- [C-CLIENT-M / docs / deployment.md](./docs/deployment.md)

## 技术栈

- React 19
- TypeScript
- Vite
- 纯 CSS token / 自定义组件样式

## 环境变量

前端是静态构建产物，以下变量在构建阶段注入：

- `VITE_APP_TITLE`
  顶部产品名，默认 `C-CLIENT-M`
- `VITE_BRIDGE_HTTP_ORIGIN`
  本地接口入口，默认 `http://127.0.0.1:4285`
- `VITE_PROJECT_ROOT`
  `POST /api/workspace/discover` 使用的项目根目录，默认 `/workspace/company`
- `VITE_CCLIENT_KEY`
  当 bridge 开启 API Key 时传入

## 本地开发

```bash
npm install
npm run dev
```

默认前端地址由 Vite 输出，bridge 入口默认按 `VITE_BRIDGE_HTTP_ORIGIN` 连接。

## 构建

```bash
npm run build
```

## Docker 部署

当前仓库支持独立打包为静态前端容器。

### 构建镜像

```bash
docker build -t c-client-m:local .
```

如果你要覆盖标题、接口地址或项目根目录：

```bash
docker build \
  --build-arg VITE_APP_TITLE=C-CLIENT-M \
  --build-arg VITE_BRIDGE_HTTP_ORIGIN=http://127.0.0.1:4285 \
  --build-arg VITE_PROJECT_ROOT=/workspace/company \
  -t c-client-m:local .
```

### 直接运行

```bash
docker run --rm -it -p 4275:80 c-client-m:local
```

启动后访问：

- Frontend: `http://127.0.0.1:4275`

### 使用 compose

```bash
docker compose up --build
```

当前 `docker-compose.yml` 默认：

- 前端容器端口：`80`
- 宿主机映射端口：`4275`
- 默认 bridge 地址：`http://127.0.0.1:4285`

## 数据来源说明

本项目当前已经切到真实接口优先：

- bridge 正常时直接读取真实数据
- bridge / discover 异常时前端直接显示错误，不再静默回退 mock

其中公司下拉直接使用 `POST /api/workspace/discover` 返回的 `companies` 字段。

## 开源边界

`C-CLIENT-M` 只负责移动端监督前端。

下面这些不在本仓库内：

- CLI / Codex 会话宿主
- bridge 服务
- 项目空间初始化与恢复
- Docker / Podman 下的执行端运行链路

这些都在 [C-CLIENT](https://github.com/cwwlla01/C-CLIENT) 中维护。

## License

[MIT](./LICENSE)
