SET NAMES utf8mb4;

ALTER TABLE `k`
  MODIFY COLUMN `volume` decimal(36,8) NULL COMMENT '成交量',
  MODIFY COLUMN `amount` decimal(36,8) NULL COMMENT '成交额';
