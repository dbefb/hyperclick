# Hyperclick 0.7.3 操作覆盖清单

## 实现与验证边界

共 47 种 HyperCore 操作；均实现请求结构校验、核对内容展示、两层签名、封装提交和真实结果回传。已用模拟环境和独立 SDK 验证编码；尚未逐项完成原生网页与真实钱包联调。

组件在原生网页已通过 Hyperclick 连接 M 时接管官方 HTTP / WebSocket 操作请求。代理发出的请求先查询其所属 M；多签权限仍由节点判断。

## 已接入操作

| 操作编号 | 中文名称 | 内层签名 |
| --- | --- | --- |
| `agentEnableDexAbstraction` | 启用跨市场账户模式 | 操作哈希签名 |
| `agentSendAsset` | 代理资产划转 | 操作哈希签名 |
| `agentSetAbstraction` | 设置账户模式 | 操作哈希签名 |
| `approveAgent` | 交易代理授权 | 明确字段签名 |
| `approveBuilderFee` | 设置开发者手续费 | 明确字段签名 |
| `batchModify` | 批量修改订单 | 操作哈希签名 |
| `borrowLend` | 借贷与出借资产 | 操作哈希签名 |
| `cDeposit` | 转入质押余额 | 明确字段签名 |
| `cWithdraw` | 提取质押余额 | 明确字段签名 |
| `cancelByCloid` | 按客户编号撤单 | 操作哈希签名 |
| `cancel` | 撤销订单 | 操作哈希签名 |
| `claimRewards` | 领取奖励 | 操作哈希签名 |
| `convertToMultiSigUser` | 修改多签配置 | 明确字段签名 |
| `createSubAccount` | 创建子账户 | 操作哈希签名 |
| `createVault` | 创建金库 | 操作哈希签名 |
| `hip3LiquidatorTransfer` | 清算账户资金划转 | 操作哈希签名 |
| `linkStakingUser` | 关联质押账户 | 明确字段签名 |
| `modify` | 修改订单 | 操作哈希签名 |
| `noop` | 使当前随机数失效 | 操作哈希签名 |
| `order` | 提交订单 | 操作哈希签名 |
| `registerReferrer` | 注册推荐码 | 操作哈希签名 |
| `reserveRequestWeight` | 购买请求额度 | 操作哈希签名 |
| `scheduleCancel` | 设置定时撤单 | 操作哈希签名 |
| `sendAsset` | 跨账户资产划转 | 明确字段签名 |
| `setDisplayName` | 修改显示名称 | 操作哈希签名 |
| `setReferrer` | 设置推荐人 | 操作哈希签名 |
| `spotSend` | 转出现货资产 | 明确字段签名 |
| `spotUser` | 设置现货零碎资产 | 操作哈希签名 |
| `stakingLinkDisableTradingUser` | 停用质押关联交易账户 | 明确字段签名 |
| `subAccountModify` | 修改子账户名称 | 操作哈希签名 |
| `subAccountSpotTransfer` | 子账户现货划转 | 操作哈希签名 |
| `subAccountTransfer` | 子账户资金划转 | 操作哈希签名 |
| `tokenDelegate` | 委托或解除委托 | 明确字段签名 |
| `topUpIsolatedOnlyMargin` | 按杠杆补充逐仓保证金 | 操作哈希签名 |
| `twapCancel` | 取消分批执行订单 | 操作哈希签名 |
| `twapOrder` | 提交分批执行订单 | 操作哈希签名 |
| `updateIsolatedMargin` | 调整逐仓保证金 | 操作哈希签名 |
| `updateLeverage` | 调整杠杆 | 操作哈希签名 |
| `usdClassTransfer` | 现货与合约划转 | 明确字段签名 |
| `usdSend` | 转出合约账户 USDC | 明确字段签名 |
| `userDexAbstraction` | 设置跨市场账户模式 | 明确字段签名 |
| `userPortfolioMargin` | 设置组合保证金 | 明确字段签名 |
| `userSetAbstraction` | 设置账户模式 | 明确字段签名 |
| `vaultDistribute` | 分配金库资金 | 操作哈希签名 |
| `vaultModify` | 修改金库设置 | 操作哈希签名 |
| `vaultTransfer` | 金库存取款 | 操作哈希签名 |
| `withdraw3` | 提现至外部地址 | 明确字段签名 |

## 未覆盖

- 原网页未发出的操作不会凭空出现新入口；本扩展不代替原网页构造所有业务界面。
- Arbitrum 入金等普通 EVM 交易，以及 HyperEVM 合约调用：属于另一种交易/权限路径。
- 部署/验证者/特殊系统操作：activateOutcomeDeployer、authorizeAqav2Role、cSignerAction、cValidatorAction、evmUserModify、finalizeEvmContract、gossipPriorityBid、perpDeploy、sendToEvmWithData、spotDeploy、userOutcome、validatorL1Stream。
- 未知或新增动作在 Hyperclick 模式下被拒绝，不回退原单签。
- 不控制其他扩展窗口置顶，也不绕过钱包确认。

## 使用前提

签名者和阈值从官方 API 查询，提交前再次核对；同一 M 在同一网络一次处理一个提案。提交人须为授权成员，其最终签名与成员签名分开。资产、金库和子账户权限、质押等待期等仍由 HyperCore 执行。

SDK 对照来源：@nktkas/hyperliquid 0.33.3；协议依据：

- https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/multi-sig
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/post-requests
- https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py

上述清单是实现范围，不等同于全部原生网页入口的实机验收结论。
