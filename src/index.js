function createLegacyBatchedSubscribe(batch) {
  let currentListeners = [];
  let nextListeners = currentListeners;

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

  function notifyListeners() {
    const listeners = currentListeners = nextListeners;
    for (let i = 0; i < listeners.length; i++) {
      listeners[i]();
    }
  }

  function notifyListenersBatched() {
    batch(notifyListeners);
  }

  return next => (...args) => {
    const store = next(...args);
    const subscribeImmediate = store.subscribe;

    function dispatch(...dispatchArgs) {
      const res = store.dispatch(...dispatchArgs);
      notifyListenersBatched();
      return res;
    }

    return {
      ...store,
      dispatch,
      subscribe,
      subscribeImmediate
    };
  };
}

function throwCollected(errors) {
  if (errors.length === 0) {
    return;
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (typeof AggregateError === 'function') {
    throw new AggregateError(errors, 'Multiple listeners threw during notification.');
  }
  const aggregate = new Error('Multiple listeners threw during notification.');
  aggregate.errors = errors;
  throw aggregate;
}

function createScheduledBatchedSubscribe({ scheduler, maxBatchDelay }) {
  const hasScheduler = typeof scheduler === 'function';
  const hasDelay = typeof maxBatchDelay === 'number' && maxBatchDelay > 0;
  const isSync = !hasScheduler && !hasDelay;

  let currentListeners = [];
  let nextListeners = currentListeners;

  let pending = false;
  let timer = null;

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
    throwCollected(errors);
  }

  function clearPendingTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function flush() {
    if (!pending) {
      return;
    }
    pending = false;
    clearPendingTimer();
    notifyListeners();
  }

  function scheduleNotify() {
    if (hasDelay) {
      timer = setTimeout(flush, maxBatchDelay);
    }
    if (hasScheduler) {
      scheduler(flush);
    }
  }

  return next => (...args) => {
    const store = next(...args);
    const subscribeImmediate = store.subscribe;

    function dispatch(...dispatchArgs) {
      const res = store.dispatch(...dispatchArgs);
      if (isSync) {
        notifyListeners();
      } else if (!pending) {
        pending = true;
        scheduleNotify();
      }
      return res;
    }

    function getPendingListenerCount() {
      return pending ? nextListeners.length : 0;
    }

    return {
      ...store,
      dispatch,
      subscribe,
      subscribeImmediate,
      flush,
      getPendingListenerCount
    };
  };
}

export function batchedSubscribe(options) {
  if (typeof options === 'function') {
    return createLegacyBatchedSubscribe(options);
  }

  if (options === null || typeof options !== 'object') {
    throw new Error('Expected batch to be a function or an options object.');
  }

  const { scheduler, maxBatchDelay } = options;

  if (scheduler !== undefined && typeof scheduler !== 'function') {
    throw new Error('Expected scheduler to be a function.');
  }

  if (maxBatchDelay !== undefined &&
      (typeof maxBatchDelay !== 'number' || maxBatchDelay < 0)) {
    throw new Error('Expected maxBatchDelay to be a non-negative number.');
  }

  return createScheduledBatchedSubscribe({ scheduler, maxBatchDelay });
}
