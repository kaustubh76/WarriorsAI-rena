/**
 * Queue and Worker Utilities
 * Task queuing, job processing, and worker management
 */

/**
 * Task priority levels
 */
export enum Priority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task definition
 */
export interface Task<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  priority: Priority;
  status: TaskStatus;
  retries: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: R;
  error?: Error;
}

/**
 * Task handler function
 */
export type TaskHandler<T = unknown, R = unknown> = (
  data: T,
  task: Task<T, R>
) => Promise<R> | R;

/**
 * Queue events
 */
export interface QueueEvents<T = unknown, R = unknown> {
  taskAdded?: (task: Task<T, R>) => void;
  taskStarted?: (task: Task<T, R>) => void;
  taskCompleted?: (task: Task<T, R>) => void;
  taskFailed?: (task: Task<T, R>, error: Error) => void;
  taskCancelled?: (task: Task<T, R>) => void;
}

/**
 * Priority Queue for task management
 */
export class TaskQueue<T = unknown, R = unknown> {
  private tasks = new Map<string, Task<T, R>>();
  private handlers = new Map<string, TaskHandler<T, R>>();
  private running = false;
  private concurrency: number;
  private activeWorkers = 0;
  private events: QueueEvents<T, R> = {};

  constructor(options?: {
    concurrency?: number;
    events?: QueueEvents<T, R>;
  }) {
    this.concurrency = options?.concurrency ?? 1;
    this.events = options?.events ?? {};
  }

  /**
   * Register a task handler
   */
  registerHandler(type: string, handler: TaskHandler<T, R>): void {
    this.handlers.set(type, handler);
  }

  /**
   * Add task to queue
   */
  addTask(
    type: string,
    data: T,
    options?: {
      priority?: Priority;
      maxRetries?: number;
    }
  ): Task<T, R> {
    const task: Task<T, R> = {
      id: this.generateTaskId(),
      type,
      data,
      priority: options?.priority ?? Priority.NORMAL,
      status: TaskStatus.PENDING,
      retries: 0,
      maxRetries: options?.maxRetries ?? 3,
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.events.taskAdded?.(task);

    // Start processing if not already running
    if (!this.running) {
      this.start();
    }

    return task;
  }

  /**
   * Get task by ID
   */
  getTask(id: string): Task<T, R> | undefined {
    return this.tasks.get(id);
  }

  /**
   * Cancel task
   */
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status === TaskStatus.RUNNING) {
      return false;
    }

    task.status = TaskStatus.CANCELLED;
    this.events.taskCancelled?.(task);
    return true;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task<T, R>[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task<T, R>[] {
    return this.getAllTasks().filter(task => task.status === status);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      running: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      failed: tasks.filter(t => t.status === TaskStatus.FAILED).length,
      cancelled: tasks.filter(t => t.status === TaskStatus.CANCELLED).length,
    };
  }

  /**
   * Start processing queue
   */
  start(): void {
    this.running = true;
    this.processQueue();
  }

  /**
   * Stop processing queue
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.tasks.clear();
  }

  /**
   * Process queue (internal)
   */
  private async processQueue(): Promise<void> {
    while (this.running) {
      // Check if we can process more tasks
      if (this.activeWorkers >= this.concurrency) {
        await this.sleep(100);
        continue;
      }

      // Get next task by priority
      const task = this.getNextTask();
      if (!task) {
        await this.sleep(100);
        continue;
      }

      // Process task
      this.activeWorkers++;
      this.processTask(task).finally(() => {
        this.activeWorkers--;
      });
    }
  }

  /**
   * Get next task by priority
   */
  private getNextTask(): Task<T, R> | undefined {
    const pendingTasks = this.getTasksByStatus(TaskStatus.PENDING);
    if (pendingTasks.length === 0) return undefined;

    // Sort by priority (highest first), then by created time (oldest first)
    pendingTasks.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt - b.createdAt;
    });

    return pendingTasks[0];
  }

  /**
   * Process a single task
   */
  private async processTask(task: Task<T, R>): Promise<void> {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = TaskStatus.FAILED;
      task.error = new Error(`No handler registered for task type: ${task.type}`);
      this.events.taskFailed?.(task, task.error);
      return;
    }

    task.status = TaskStatus.RUNNING;
    task.startedAt = Date.now();
    this.events.taskStarted?.(task);

    try {
      const result = await handler(task.data, task);
      task.result = result;
      task.status = TaskStatus.COMPLETED;
      task.completedAt = Date.now();
      this.events.taskCompleted?.(task);
    } catch (error) {
      task.retries++;

      if (task.retries >= task.maxRetries) {
        task.status = TaskStatus.FAILED;
        task.error = error as Error;
        task.completedAt = Date.now();
        this.events.taskFailed?.(task, error as Error);
      } else {
        // Retry the task
        task.status = TaskStatus.PENDING;
        delete task.startedAt;
      }
    }
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simple in-memory job queue
 */
export class JobQueue<T = unknown> {
  private queue: T[] = [];

  enqueue(item: T): void {
    this.queue.push(item);
  }

  dequeue(): T | undefined {
    return this.queue.shift();
  }

  peek(): T | undefined {
    return this.queue[0];
  }

  get size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
  }

  toArray(): T[] {
    return [...this.queue];
  }
}

/**
 * Rate-limited queue
 */
export class RateLimitedQueue<T = unknown> {
  private queue = new JobQueue<T>();
  private processing = false;

  constructor(
    private processor: (item: T) => Promise<void> | void,
    private rateLimit: {
      maxCalls: number;
      perMilliseconds: number;
    }
  ) {}

  async add(item: T): Promise<void> {
    this.queue.enqueue(item);
    if (!this.processing) {
      await this.process();
    }
  }

  private async process(): Promise<void> {
    this.processing = true;
    const { maxCalls, perMilliseconds } = this.rateLimit;
    let calls = 0;
    let windowStart = Date.now();

    while (!this.queue.isEmpty()) {
      const now = Date.now();

      // Reset window if needed
      if (now - windowStart >= perMilliseconds) {
        calls = 0;
        windowStart = now;
      }

      // Check if we've hit the rate limit
      if (calls >= maxCalls) {
        const waitTime = perMilliseconds - (now - windowStart);
        await this.sleep(waitTime);
        calls = 0;
        windowStart = Date.now();
      }

      // Process next item
      const item = this.queue.dequeue();
      if (item) {
        await this.processor(item);
        calls++;
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Worker pool for parallel processing
 */
export class WorkerPool<T = unknown, R = unknown> {
  private workers: Worker[] = [];
  private taskQueue = new JobQueue<{
    task: T;
    resolve: (result: R) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private workerCount: number,
    private processor: (task: T) => Promise<R>
  ) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      this.workers.push({
        id: i,
        busy: false,
      } as Worker);
    }
  }

  async execute(task: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.taskQueue.enqueue({ task, resolve, reject });
      this.assignTask();
    });
  }

  private async assignTask(): Promise<void> {
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker || this.taskQueue.isEmpty()) {
      return;
    }

    const job = this.taskQueue.dequeue();
    if (!job) return;

    availableWorker.busy = true;

    try {
      const result = await this.processor(job.task);
      job.resolve(result);
    } catch (error) {
      job.reject(error as Error);
    } finally {
      availableWorker.busy = false;
      this.assignTask(); // Try to assign next task
    }
  }

  getStats(): { total: number; busy: number; idle: number } {
    const busy = this.workers.filter(w => w.busy).length;
    return {
      total: this.workers.length,
      busy,
      idle: this.workers.length - busy,
    };
  }
}

interface Worker {
  id: number;
  busy: boolean;
}

/**
 * Batch processor for grouping operations
 */
export class BatchProcessor<T, R> {
  private batch: T[] = [];
  private timeout?: ReturnType<typeof setTimeout>;

  constructor(
    private processor: (items: T[]) => Promise<R[]>,
    private options: {
      maxBatchSize: number;
      maxWaitTime: number; // milliseconds
    }
  ) {}

  async add(item: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.batch.push(item);

      // Store resolve/reject with the item
      const index = this.batch.length - 1;

      // Process if batch is full
      if (this.batch.length >= this.options.maxBatchSize) {
        this.flush().then(results => {
          resolve(results[index]);
        }).catch(reject);
        return;
      }

      // Set timeout for partial batch
      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          this.flush().then(results => {
            resolve(results[index]);
          }).catch(reject);
        }, this.options.maxWaitTime);
      }
    });
  }

  private async flush(): Promise<R[]> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    if (this.batch.length === 0) {
      return [];
    }

    const items = [...this.batch];
    this.batch = [];

    return this.processor(items);
  }
}

/**
 * Debounced queue processor
 */
export class DebouncedQueue<T> {
  private queue: T[] = [];
  private timeout?: ReturnType<typeof setTimeout>;

  constructor(
    private processor: (items: T[]) => Promise<void> | void,
    private debounceMs: number = 1000
  ) {}

  add(item: T): void {
    this.queue.push(item);

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const items = [...this.queue];
    this.queue = [];

    await this.processor(items);
  }

  clear(): void {
    this.queue = [];
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }
}

/**
 * Create a task queue instance
 */
export function createTaskQueue<T = unknown, R = unknown>(
  options?: {
    concurrency?: number;
    events?: QueueEvents<T, R>;
  }
): TaskQueue<T, R> {
  return new TaskQueue<T, R>(options);
}

/**
 * Create a rate-limited queue
 */
export function createRateLimitedQueue<T>(
  processor: (item: T) => Promise<void> | void,
  maxCalls: number,
  perMilliseconds: number
): RateLimitedQueue<T> {
  return new RateLimitedQueue(processor, { maxCalls, perMilliseconds });
}
