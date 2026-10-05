# 分发与收入建议

针对单人维护的 Hyperclick，2026-10-05。以下价格是可测试的产品方案，不是行业成交数据或收入预测。

## 建议：先开源核心，再验证付费意愿

钱包协调扩展最需要解决的是用户信任。公开源码、固定版本、可核对构建与明确权限，有助于用户和技术人员检查实现；仍不能代替安全审计。先保持核心协调功能免费，开放 USDC 自愿支持、GitHub Sponsors（以地区资格为准）或生态赞助；另提供范围明确的团队接入、优先排查等付费服务。

赞助是可尝试的收入来源，不宜当成稳定收入承诺。不要从交易金额暗扣费用，也不要把捐赠与钱包签名放在同一确认按钮内。实际收款地址、链和资产需由维护者核实后公布；本版未配置任何收款入口。

若选 MIT，通常便于集成，但也允许他人在保留必要声明的条件下商业使用、修改与分发；不能既授予 MIT 又要求所有商业使用者必须向你付费。若考虑其他许可证，应根据希望允许的用途选择，不要把“仅可查看源码”标为真正开源。当前源码仍为 `UNLICENSED`，本次未擅自改变许可。

## 若先做闭源付费

分发和支付应拆开：**Chrome Web Store 负责安装与更新，外部结账服务负责收费，你的授权逻辑负责开通功能。** Chrome Web Store 原生付款已停用；Edge 可作为后续分发渠道，不必第一天同时维护多个商店。

最简商业实验可以是一个个人档：14 天试用，69 美元/年，按账号或合理限定的多签账户数授权。先访谈或邀请少量真实用户验证，不立即开发复杂套餐。团队支持另议，明确服务范围，不承诺全天候响应。避免终身低价但无限维护的安排。

ExtensionPay 等扩展支付服务可以减少自建结账和订阅后台工作，但需要检查服务条款、地区与收款主体资格、退款规则，以及支付商是否接受该类 Web3 签名工具。不能假定申请 Stripe 即一定能开通。若选 USDC 手工收款，初期可人工开通，规模增加后仍需处理确认、退款、错链和授权到期；这并非完全零维护。

付费授权系统只控制产品权益，不能参与决定交易签名内容。支付失败、许可服务器故障或订阅到期不应扣留用户已生成的提案或签名；至少提供明确取消、导出和恢复说明。扩展里不能保存支付服务密钥。当前 0.7.3 未实现收费或许可系统。

闭源浏览器扩展的分发代码仍可被用户检查。不要把打包或压缩当作保密机制；Chrome/Edge 政策限制混淆与远程代码。产品价值需要来自稳定维护、体验、信誉及服务。

## 单人起步顺序

先完成测试与安全文档，邀请 5–10 位真实多签使用者试用。记录安装到首次成功的障碍及售后时间；不必为此加入后台统计。然后选择赞助或单一订阅方案，验证是否有人实际支付，再决定是否扩大投入。商店上架不会自动带来流量或收入。

## 原始资料

- [Chrome Web Store Payments 停用说明（GoogleChrome 文档仓库）](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md)
- [Chrome Web Store 开发者政策](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Microsoft Edge 扩展开发者政策](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
- [ExtensionPay](https://extensionpay.com/)
- [Stripe 限制业务规则](https://stripe.com/legal/restricted-businesses)
- [MIT 许可说明及原文](https://choosealicense.com/licenses/mit/)
