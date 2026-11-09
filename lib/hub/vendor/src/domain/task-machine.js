const transitions = {
    queued: [
        'running',
        'blocked',
        'failed'
    ],
    running: [
        'waiting',
        'review',
        'failed',
        'blocked'
    ],
    waiting: [
        'running',
        'failed',
        'blocked'
    ],
    review: [
        'done',
        'running',
        'failed'
    ],
    done: [],
    failed: [
        'queued'
    ],
    blocked: [
        'queued',
        'running'
    ]
};
export function canTransition(from, to) {
    return transitions[from].includes(to);
}
export function transitionTask(from, to) {
    if (!canTransition(from, to)) {
        throw new Error(`Invalid task transition: ${from} -> ${to}`);
    }
    return to;
}
export function transitionTaskRecord(task, requestedStatus, context = {}) {
    if (!canTransition(task.status, requestedStatus)) {
        throw new Error(`Invalid task transition: ${task.status} -> ${requestedStatus}`);
    }
    if (requestedStatus === 'review' && !task.reviewerId) {
        throw new Error('Assign a reviewer before submitting this task for acceptance');
    }
    if (task.status === 'review' && (requestedStatus === 'done' || requestedStatus === 'running')) {
        if (!task.reviewerId) {
            throw new Error('Assign a reviewer before reviewing this task');
        }
        if (context.actorId !== task.reviewerId) {
            throw new Error('Only the assigned reviewer can accept or return this task');
        }
    }
    let status = requestedStatus;
    if (requestedStatus === 'running' && task.dependsOn.length > 0) {
        const byId = new Map((context.tasks ?? []).map((candidate)=>[
                candidate.id,
                candidate.status
            ]));
        const unfinished = task.dependsOn.filter((dependencyId)=>byId.get(dependencyId) !== 'done');
        if (unfinished.length > 0) {
            if (task.status === 'blocked') {
                throw new Error(`Task dependencies are not accepted yet: ${unfinished.join(', ')}`);
            }
            status = 'blocked';
        }
    }
    if (!canTransition(task.status, status)) {
        throw new Error(`Invalid task transition: ${task.status} -> ${status}`);
    }
    const consumesRetry = task.status === 'review' && requestedStatus === 'running' || task.status === 'failed' && requestedStatus === 'queued';
    if (consumesRetry && task.retryCount >= task.maxRetries) {
        throw new Error(`Retry limit reached (${task.retryCount}/${task.maxRetries})`);
    }
    return {
        ...task,
        status,
        retryCount: task.retryCount + (consumesRetry ? 1 : 0),
        updatedAt: context.now ?? new Date().toISOString()
    };
}
export function taskStatusLabel(status) {
    return ({
        queued: '待处理',
        running: '进行中',
        waiting: '等待中',
        review: '待验收',
        done: '已验收',
        failed: '失败',
        blocked: '受阻'
    })[status];
}
