export function batchedSubscribe(options = {}) {
  let config = options;

  if (typeof config === 'function') {
    config = { scheduler: config };
  }

  if (config === null || typeof config !== 'object') {
    throw new Error('Expected options to be an object or a scheduler function.');
  }

  const { scheduler, maxBatchDelay } = config;

  if (scheduler !== undefined && typeof scheduler !== 'function') {
    throw new Error('Expected scheduler to be a function.');
  }

  if (maxBatchDelay !== undefined &&
      (typeof maxBatchDelay !== 'number' || maxBatchDelay < 0)) {
    throw new Error('Expected maxBatchDelay to be a non-negative number.');
  }

  const isSync = scheduler === undefined && maxBatchDelay === undefined;

  return next => (...args) => {
    const store = next(...args);
    const subscribeImmediate = store.subscribe;

    let currentListeners = [];
    let nextListeners = currentListeners;
    let isPending = false;
    let timerId = null;

    function ensureCanMutateNextListeners() {
      if (nextListeners === currentListeners) {
        nextListeners = currentListeners.slice();
      }
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Expected listener to be a function.');
      }

      let isSubscribed = true;

      ensureCanMutateNextListeners();
      nextListeners.push(listener);

      return function unsubscribe() {
        if (!isSubscribed) {
          return;
        }

        isSubscribed = false;

        ensureCanMutateNextListeners();
        const index = nextListeners.indexOf(listener);
        nextListeners.splice(index, 1);
      };
    }

    function clearPendingTimer() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    function notifyListeners() {
      const listeners = currentListeners = nextListeners;
      const errors = [];

      for (let i = 0; i < listeners.length; i++) {
        try {
          listeners[i]();
        } catch (err) {
          errors.push(err);
        }
      }

      if (errors.length > 0) {
        const error = new Error(
          `${errors.length} listener(s) threw during batched notification.`
        );
        error.errors = errors;
        throw error;
      }
    }

    function flush() {
      if (!isPending) {
        return;
      }

      isPending = false;
      clearPendingTimer();
      notifyListeners();
    }

    function scheduleNotify() {
      if (isSync) {
        notifyListeners();
        return;
      }

      if (isPending) {
        return;
      }

      isPending = true;

      if (scheduler !== undefined) {
        scheduler(flush);
      }

      if (maxBatchDelay !== undefined && isPending) {
        timerId = setTimeout(flush, maxBatchDelay);
      }
    }

    function dispatch(...dispatchArgs) {
      const res = store.dispatch(...dispatchArgs);
      scheduleNotify();
      return res;
    }

    function getPendingCount() {
      return isPending ? nextListeners.length : 0;
    }

    return {
      ...store,
      dispatch,
      subscribe,
      subscribeImmediate,
      flush,
      getPendingCount
    };
  };
}
