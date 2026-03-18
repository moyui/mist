import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { McpErrorCode, McpError } from '@app/constants';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PeriodEnum = z.enum([
  'ONE',
  'FIVE',
  'FIFTEEN',
  'THIRTY',
  'SIXTY',
  'DAILY',
]);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PeriodArrayEnum = z.array(PeriodEnum);

/**
 * MCP Service for Scheduled Tasks Management
 *
 * Provides tools for managing and triggering scheduled data collection tasks:
 * - Trigger manual data collection
 * - Get task status
 * - List scheduled jobs
 */
@Injectable()
export class ScheduleMcpService extends BaseMcpToolService {
  constructor(private readonly schedulerRegistry: SchedulerRegistry) {
    super(ScheduleMcpService.name);
  }

  /**
   * Trigger immediate data collection for a specific index and period
   *
   * Note: This is a PoC implementation. In production, you would integrate
   * with the actual schedule app's data collection logic.
   *
   * @param symbol - Index symbol (e.g., '000001' for Shanghai Composite)
   * @param period - Time period to collect
   * @returns Job execution result
   */
  @Tool({
    name: 'trigger_data_collection',
    description: `Manually trigger data collection for a specific index and period.

PURPOSE: On-demand data refresh outside scheduled collection times.
Useful for getting latest data or filling gaps.

WHEN TO USE: Refreshing data outside scheduled times, filling missing
historical data, testing data collection.

REQUIRES: symbol (e.g., '000001'), period (ONE/FIVE/FIFTEEN/THIRTY/SIXTY/DAILY).

NOTE: This is a PoC implementation.

RETURNS: Job confirmation with symbol, period, timestamp, and job ID.`,
  })
  async triggerDataCollection(
    symbol: string,
    period: z.infer<typeof PeriodEnum>,
  ) {
    return this.executeTool('trigger_data_collection', async () => {
      // PoC: In production, this would call the actual data collection service
      // For now, return a mock response
      return {
        message: `Data collection triggered for ${symbol} (${period})`,
        data: {
          symbol,
          period,
          triggeredAt: new Date().toISOString(),
          status: 'queued',
          // In production: actual job ID from the scheduler
          jobId: `job_${Date.now()}`,
        },
      };
    });
  }

  /**
   * Get status of all scheduled jobs
   *
   * @returns List of all scheduled jobs with their status
   */
  @Tool({
    name: 'list_scheduled_jobs',
    description: `List all configured scheduled data collection jobs.

PURPOSE: Discovery tool to see what scheduled tasks exist and their status.
Useful for monitoring and debugging.

WHEN TO USE: Checking configured jobs, monitoring job status,
debugging data collection issues.

REQUIRES: No parameters.

RETURNS: Array of job objects with name and running status.`,
  })
  async listScheduledJobs() {
    return this.executeTool('list_scheduled_jobs', async () => {
      const jobs = this.schedulerRegistry.getCronJobs();
      const jobList = Array.from(jobs.entries()).map(([name, job]) => ({
        name,
        running: job?.running ?? false,
      }));

      return {
        data: jobList,
        count: jobList.length,
      };
    });
  }

  /**
   * Get a specific scheduled job information
   *
   * @param jobName - Name of the scheduled job
   * @returns Job information
   */
  @Tool({
    name: 'get_job_status',
    description: `Get detailed status of a specific scheduled job.

PURPOSE: Retrieve status information for a single scheduled job including
running state and last execution time.

WHEN TO USE: Checking if a specific job is running, monitoring job
execution, debugging job issues.

REQUIRES: jobName - Name of the scheduled job.

NOTE: Use list_scheduled_jobs to get available job names first.

RETURNS: Job object with name, running status, and last execution time.`,
  })
  async getJobStatus(jobName: string) {
    return this.executeTool('get_job_status', async () => {
      const job = this.schedulerRegistry.getCronJob(jobName);

      if (!job) {
        throw new McpError(
          `Job ${jobName} not found`,
          McpErrorCode.INVALID_PARAMETER,
        );
      }

      return {
        data: {
          name: jobName,
          running: job.running,
          lastExecution: job?.lastDate?.()?.toISOString(),
        },
      };
    });
  }

  /**
   * Trigger batch data collection for multiple indices
   *
   * @param symbols - Array of index symbols
   * @param periods - Array of time periods to collect
   * @returns Batch job execution result
   */
  @Tool({
    name: 'trigger_batch_collection',
    description: `Trigger data collection for multiple indices and periods.

PURPOSE: Efficiently trigger data collection for multiple combinations
of indices and time periods in one batch operation.

WHEN TO USE: Collecting data for multiple indices at once, bulk data
refresh operations, filling gaps across multiple symbols.

REQUIRES: symbols (array of index codes), periods (array of time periods).

RETURNS: Batch job confirmation with task count and sample tasks.`,
  })
  async triggerBatchCollection(
    symbols: string[],
    periods: z.infer<typeof PeriodArrayEnum>,
  ) {
    return this.executeTool('trigger_batch_collection', async () => {
      const tasks = [];
      for (const symbol of symbols) {
        for (const period of periods) {
          tasks.push({ symbol, period });
        }
      }

      return {
        message: `Batch data collection triggered for ${tasks.length} tasks`,
        data: {
          taskCount: tasks.length,
          triggeredAt: new Date().toISOString(),
          status: 'queued',
          tasks: tasks.slice(0, 10), // Return first 10 tasks as sample
          // In production: actual batch job ID
          batchId: `batch_${Date.now()}`,
        },
      };
    });
  }

  /**
   * Get data collection schedule configuration
   *
   * @returns Current schedule configuration
   */
  @Tool({
    name: 'get_schedule_config',
    description: `Get the data collection schedule configuration.

PURPOSE: View current schedule configuration for all automated data
collection jobs. Shows cron expressions and descriptions.

WHEN TO USE: Understanding when data is collected, checking automation
schedule, configuring or debugging schedules.

REQUIRES: No parameters.

RETURNS: Schedule configuration with job names, time periods, cron
expressions, and human-readable descriptions.`,
  })
  async getScheduleConfig() {
    return this.executeTool('get_schedule_config', async () => {
      // PoC: Return typical schedule configuration
      // In production, this would read from actual configuration
      return {
        data: {
          description: 'Mist 数据采集计划配置',
          schedules: [
            {
              name: '日线数据采集',
              period: 'DAILY',
              cron: '0 17 * * 1-5', // 工作日 17:00
              description: '每个工作日下午5点采集日线数据',
            },
            {
              name: '1分钟数据采集',
              period: 'ONE',
              cron: '*/1 * 9-15 * * 1-5', // 工作日 9:00-15:00 每分钟
              description: '交易时间内每分钟采集一次',
            },
            {
              name: '5分钟数据采集',
              period: 'FIVE',
              cron: '*/5 * 9-15 * * 1-5', // 工作日 9:00-15:00 每5分钟
              description: '交易时间内每5分钟采集一次',
            },
            {
              name: '15分钟数据采集',
              period: 'FIFTEEN',
              cron: '*/15 * 9-15 * * 1-5', // 工作日 9:00-15:00 每15分钟
              description: '交易时间内每15分钟采集一次',
            },
            {
              name: '30分钟数据采集',
              period: 'THIRTY',
              cron: '*/30 * 9-15 * * 1-5', // 工作日 9:00-15:00 每30分钟
              description: '交易时间内每30分钟采集一次',
            },
            {
              name: '60分钟数据采集',
              period: 'SIXTY',
              cron: '0 * 9-15 * * 1-5', // 工作日 9:00-15:00 每小时
              description: '交易时间内每小时采集一次',
            },
          ],
        },
      };
    });
  }
}
