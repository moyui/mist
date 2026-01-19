# 目的

本项目是借助nest技术栈所开发的一款股票告警软件，用以通过一系列策略发出买入买出点，
目前需求如下

## 需求

该项目迭代肯定要花费大量时间，目前一期的目标是上证指数的分析，同时数据采集部分通过deepseek完成
所需的模块如下

1. 数据采集与存储模块，通过开源接口收集a股数据，清洗后并存储在本地的mysql数据库，时间精度目前期望实现分钟级别
2. 指标展示模块，通过相关开源算法或者其他方向实现a股常用指标的判断和展示，目前一期打算实现k线，macd和kdj
3. 策略分析模块，通过相关策略配置实现买入卖出点的告警，目前一期打算实现顶背离和底背离，后期需要实现分钟级别共振和缠论中的顶背驰和底背驰
4. 告警模块，通过策略分析模块中得到的告警，发出提示，目前一期期望实现微信告警或者qq机器人告警
5. 回测模块，通过当前策略以及历史数据分析策略的有效性，目前一期暂时不做考虑开发

## 详细设计

### 数据采集与存储

感谢 [AKTools](https://aktools.akfamily.xyz/#fastapi) 目前尝试使用aktools来本地启动金融api，后续会自己替换
采集：axios请求本地http接口
收集：mysql存储格式化数据

附：python使用说明

- 安装虚拟环境
  python3 -m venv python-env
- 激活虚拟环境
  source python-env/bin/activate
- 退出虚拟环境
  deactivate
- 安装AKTools
  python3 -m pip install aktools
- 启动
  python3 -m aktools

数据库建立语句 CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;

设计表结构

指数表 - IndexData

| 字段名      | 数据类型      | 描述                                |
| ----------- | ------------- | ----------------------------------- |
| id          | INT           | 指数id                              |
| name        | VARCHAR(50)   | 指数名                              |
| symbol      | VARCHAR(50)   | 指数编号                            |
| type        | ENUM          | 指数类型 1-大盘股 2-中盘股 3-小盘股 |
| period      | IndexPeriod[] | 外键                                |
| create_time | DATETIME      | 创建时间                            |
| update_time | DATETIME      | 更新时间                            |

指数分时表（5、15、30、60分钟都类似） - IndexPeriod

| 字段名      | 数据类型       | 描述                           |
| ----------- | -------------- | ------------------------------ |
| id          | INT            | id (主键)                      |
| time        | VARCHAR(50)    | 时间                           |
| open        | DCECIMAL(12,2) | 开盘                           |
| close       | DCECIMAL(12,2) | 收盘                           |
| highest     | DCECIMAL(12,2) | 最高                           |
| lowest      | DCECIMAL(12,2) | 最低                           |
| volume      | BIGINT         | 成交量 注意单位: 手            |
| price       | DOUBLE         | 成交额 注意单位: 元            |
| type        | ENUM           | 类型 FIVE FIFTEEN THIRTY SIXTY |
| index_id    | INT            | 指数id 外键                    |
| create_time | DATETIME       | 创建时间                       |
| update_time | DATETIME       | 更新时间                       |

<!-- | vibration     | DCECIMAL(12,2) | 振幅          这两个指标不一定有                 |
| turnover_rate | DOUBLE         | 换手率                         | -->

定时任务 使用 @nestjs/schedule，效果有待考察

时间构建和时区转换 使用 date-fns date-fns-tz插件，效果有待考察。

目前已经实现1分钟，5分钟，15分钟，30分钟，60分钟级别的存储，日线级别存储开发完成，目前日线级别每天下午17点00跑取当天的数据

### 指标开发

目前预计通过实时统计macd和kdj2个指标，k线图的话使用echarts开源显示即可，甚至对于后台系统无需显示开源指标

指标开发采用node-talib 目前支持的函数见Talib.md 文件，[官方文档](https://github.com/oransel/node-talib) [原始c代码](https://ta-lib.org/)

目前实现KDJ，MACD，RSI, K的接口获取，已经顺利完工

### 策略分析

目前想采取的方案是使用deepseek api + 智能体agent + 策略模型 + 接口知识库，目前个人需要补齐所需技能点中，项目开发暂缓，先运行测试数据

补齐智能体相关知识后，目前规划如下

#### 角色细分

1. Commander - 接收用户指令/目标、任务规划与拆解、任务分配与协调、汇总与判断、触发输出
2. DataEngineer - 所有数据获取、处理、计算、向量存储/检索。为其他Agent提供干净、标准化的数据。
3. Strategist -  应用预定义策略规则（技术面、基本面、混合）到当前数据，输出明确的策略信号（买入/卖出/持有/观望信号及强度）。
4. PatternFinder - 根据当前形态检索相似历史片段，分析后续走势概率分布和关键特征，提供基于历史的概率性洞见。
5. SentimentAnalyst - 监控并量化分析新闻、社交媒体、研报等文本信息中的市场情绪和重大事件，输出情绪指标和事件摘要。
6. Reporter - 生成定期/按需报告、生成即时预警
7. RiskMonitor - 监控市场风险、监控个股/组合风险、风险预警、移除

#### 流程图
```text
[用户/外部触发 (设置监控目标/条件)]
        |
        v
[指挥中心 (Commander)]
  /      |       |       |       \
 /       |       |       |        \
v        v       v       v         v
[数据引擎]   [策略分析师]  [历史模式分析师] [市场情绪分析员]  [风险监控员]
  ^        ^       ^       ^         ^
  |        |       |       |         | (提供数据/结果)
  |        |       |       |         |
  |        ---------       |         |
  |        |       |       |         |
  |        v       v       v         v
  |    [策略信号] [历史洞见] [情绪指标] [风险信号]
  |        |       |       |         |
  |        ---------       |         |
  |        |               |         |
  |        v               |         |
  |    [指挥中心汇总与判断] <----------+
  |        |
  |        |--> (达到预警条件?) --否--> [可能等待/继续监控]
  |        |
  |       是
  |        |
  |        v
  |    [报告生成员 (Reporter)]
  |        |
  |        |--> 生成[即时预警 (Alert)] --> 推送至用户 (邮件/短信/App等)
  |        |
  |        |--> 生成[定期/按需报告] --> 推送至用户/存储
  |
  | (数据引擎持续为所有Agent提供数据支持)
  ------------------------------------
```
### 图表查看

优先级较低，目前方案预计使用echarts + eta模版直出方案

更新：采用next模版快速搭建，在mist项目集里面增加mist-fe

### 告警提示

通过微信告警？

### 踩坑

aktools不会自动提示端口被占用，从而导致请求失败

使用 date-fns date-fns-tz插件，需要在对应的位置配置当地服务器时区

切换成monorepo架构，主核心是mist，saya为ai agent

继续拆分架构，将mist中定时器部分拆出来，目前主核心是mist，saya为 ai agent，schedule为定时器脚本。分别独立部署

目前正在开发缠论分析模块，此模块暂时不需要接入模型能力，只for图表使用+策略使用
