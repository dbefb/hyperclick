# 向 Hyperliquid 介绍 Hyperclick

核实日期：2026-10-05。本文提供沟通草案，尚未发送给任何人，也不代表获得收录、授权或背书。

## 已核实的渠道

- 官方文档要求 API 相关问题在官方 Discord 的 **#api-traders** 提问，而不是开普通客服工单：[官方说明](https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/building-on-hyperliquid/i-have-api-related-questions)。Discord 链接以官方文档及官网为准。
- 官网有 [Apps 页面](https://hyperliquid.xyz/apps)。本次查看官网与该页面，未找到公开的标准项目申报表或承诺收录流程；不能据此保证上线、推荐或审核。
- API 公告频道：[官方文档所列 Telegram](https://t.me/hyperliquid_api)。公告频道用于跟踪变化，不假定它接受项目提交。

## 建议顺序

1. 先完成公开材料：固定版本源码、可安装包、2 分钟左右测试网演示、架构和数据流、逐动作验证矩阵、安全与隐私说明。
2. 在开发者渠道就具体技术问题请求反馈：原生多签的内外层绑定、代理请求兼容、网页集成方式和协议限制。保持一次简洁介绍，遵守频道规则，不反复发布推广。
3. 请团队指引适合社区工具介绍或 Apps 收录的联系人/渠道，再按要求提交材料。将技术答复、目录收录、安全审计、商业合作分别对待。
4. 记录回复和版本，修复问题并补证据，再提出收录申请。未经明确许可，不使用“Hyperliquid 官方插件”或官方审核表述。

## 提交材料清单

| 材料 | 当前状态 |
| --- | --- |
| 简短产品介绍与使用流程 | `README.en.md` 已准备 |
| 对应源码及安装包 | 本地 0.7.3 包已准备，GitHub 地址待创建 |
| 架构、权限与数据流 | `ARCHITECTURE.md`、`PRIVACY.md` 已准备 |
| 动作覆盖、自动化及真实钱包证据 | 自动化见 `VALIDATION.md`；本版实机证据待补 |
| 安全报告渠道 | `SECURITY.md` 草案；真实私密入口待填 |
| 视频演示和支持联系方式 | 待补 |
| 开源许可证 | 未选择，当前 `UNLICENSED` |
| 独立安全审计 | 未完成，不得暗示已有 |

## 英文首次联系草稿

发送前替换方括号内容，并根据是否已经选定许可证准确使用 open-source 一词。本稿暂不宣称开源。

> Hi, I'm the independent developer of Hyperclick, a local browser extension for coordinating native HyperCore multisig operations initiated from the Hyperliquid web app.
>
> Users connect through OKX Wallet or OneKey, review the operation, collect member signatures, and have the designated submitter sign the outer multisig payload. Private keys remain in the wallets; the extension sends queries and approved submissions directly to the official Hyperliquid API. It has no maintainer-operated backend.
>
> The current development preview contains 47 explicit action adapters with SDK comparison tests. We distinguish implemented adapters from live-wallet and node acceptance: not all actions have completed end-to-end live testing, and this version has not received an independent security audit.
>
> Source/release: [URL]. Demo: [URL]. Architecture, permissions, coverage and validation: [URL]. Private security contact: [CONTACT].
>
> Could someone advise whether our multisig and web integration approach is compatible with the intended protocol behavior, and point us to the appropriate process for introducing a community tool or requesting consideration for an ecosystem listing? We are not claiming official affiliation or endorsement.

## 演示建议

录制测试网：选择 Hyperclick → OKX 连接 M → 发起操作 → 核对内容 → 选择提交人 → OKX/OneKey 混合成员签名 → 提交人最终签名 → 节点响应 → 继续下一次操作。包含一次切错账户提示，说明网页 M 与真实钱包当前成员的区别。不要展示私钥、助记词或仍可使用的完整签名。
