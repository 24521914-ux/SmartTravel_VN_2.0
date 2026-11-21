package vn.smarttravel.intelligence.ranking.service;

import jakarta.annotation.PreDestroy;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Dedicated bounded background executor for CF builds, Evaluation runs, and Weight Tuning jobs.
 * Isolated from Tomcat request threads and online ranking inference pool.
 */
@Component
public class RankingBackgroundExecutor {

    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 2, 60L, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32),
            r -> {
                Thread t = new Thread(r, "ranking-bg-worker");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.AbortPolicy()
    );

    private final ConcurrentHashMap<UUID, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Future<?>> runningFutures = new ConcurrentHashMap<>();

    public AtomicBoolean registerAndSubmit(UUID jobId, Runnable task) {
        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(jobId, cancelled);
        Runnable submitAction = () -> {
            Future<?> future = executor.submit(() -> {
                try {
                    task.run();
                } finally {
                    runningFutures.remove(jobId);
                    cancelFlags.remove(jobId);
                }
            });
            runningFutures.put(jobId, future);
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    submitAction.run();
                }

                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        cancelFlags.remove(jobId);
                    }
                }
            });
        } else {
            submitAction.run();
        }
        return cancelled;
    }

    public boolean requestCancel(UUID jobId) {
        AtomicBoolean flag = cancelFlags.get(jobId);
        if (flag != null) {
            flag.set(true);
        }
        Future<?> f = runningFutures.get(jobId);
        return f != null && f.cancel(true);
    }

    public boolean isCancelled(UUID jobId) {
        AtomicBoolean flag = cancelFlags.get(jobId);
        return flag != null && flag.get();
    }

    public Map<String, Object> poolStatus() {
        return Map.of(
                "active_threads", executor.getActiveCount(),
                "queue_size", executor.getQueue().size(),
                "max_pool_size", executor.getMaximumPoolSize()
        );
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
