import { batchedSubscribe } from '../';
import expect from 'expect';

function createStoreShape() {
  return {
    dispatch: expect.createSpy(),
    subscribe: expect.createSpy()
  };
}

function createBatchedStore(options = (cb) => cb()) {
  const baseStore = createStoreShape();
  const createStore = () => baseStore;
  const batchedStore = batchedSubscribe(options)(createStore)();
  batchedStore.base = baseStore;

  return batchedStore;
}

function createCounterStore() {
  let state = 0;
  return {
    dispatch(action) {
      if (action.type === 'inc') {
        state += 1;
      }
      return action;
    },
    subscribe() {
      return () => {};
    },
    getState() {
      return state;
    }
  };
}

describe('batchedSubscribe()', () => {
  it('it calls batch function on dispatch', () => {
    const batchSpy = expect.createSpy();
    const store = createBatchedStore(batchSpy);

    store.dispatch({ type: 'foo' });

    expect(batchSpy.calls.length).toEqual(1);
  });

  it('batch callback executes listeners', () => {
    const subscribeCallbackSpy = expect.createSpy();
    const store = createBatchedStore();

    store.subscribe(subscribeCallbackSpy);
    store.dispatch({ type: 'foo' });

    expect(store.base.subscribe.calls.length).toEqual(0);
    expect(subscribeCallbackSpy.calls.length).toEqual(1);
  });

  it('it exposes base subscribe as subscribeImmediate', () => {
    const store = createBatchedStore();
    store.subscribeImmediate();

    expect(store.base.subscribe.calls.length).toEqual(1);
  });

  it('unsubscribes batch callbacks', () => {
    const subscribeCallbackSpy = expect.createSpy();
    const store = createBatchedStore();
    const unsubscribe = store.subscribe(subscribeCallbackSpy);

    unsubscribe();

    store.dispatch({ type: 'foo' });

    expect(subscribeCallbackSpy.calls.length).toEqual(0);
  });

  it('should support removing a subscription within a subscription', () => {
    const store = createBatchedStore();

    const listenerA = expect.createSpy();
    const listenerB = expect.createSpy();
    const listenerC = expect.createSpy();

    store.subscribe(listenerA);
    const unSubB = store.subscribe(() => {
      listenerB();
      unSubB();
    });
    store.subscribe(listenerC);

    store.dispatch({});
    store.dispatch({});

    expect(listenerA.calls.length).toEqual(2);
    expect(listenerB.calls.length).toEqual(1);
    expect(listenerC.calls.length).toEqual(2);
  });

  it('only removes listener once when unsubscribe is called', () => {
    const store = createBatchedStore();
    const listenerA = expect.createSpy(() => {});
    const listenerB = expect.createSpy(() => {});

    const unsubscribeA = store.subscribe(listenerA);
    store.subscribe(listenerB);

    unsubscribeA();
    unsubscribeA();

    store.dispatch({ type: 'foo' });
    expect(listenerA.calls.length).toBe(0);
    expect(listenerB.calls.length).toBe(1);
  });

  it('delays unsubscribe until the end of current dispatch', () => {
    const store = createBatchedStore();

    const unsubscribeHandles = [];
    const doUnsubscribeAll = () => unsubscribeHandles.forEach(
      unsubscribe => unsubscribe()
    );

    const listener1 = expect.createSpy(() => {});
    const listener2 = expect.createSpy(() => {});
    const listener3 = expect.createSpy(() => {});

    unsubscribeHandles.push(store.subscribe(() => listener1()));
    unsubscribeHandles.push(store.subscribe(() => {
      listener2();
      doUnsubscribeAll();
    }));

    unsubscribeHandles.push(store.subscribe(() => listener3()));

    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(1);
    expect(listener2.calls.length).toBe(1);
    expect(listener3.calls.length).toBe(1);

    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(1);
    expect(listener2.calls.length).toBe(1);
    expect(listener3.calls.length).toBe(1);
  });

  it('delays subscribe until the end of current dispatch', () => {
    const store = createBatchedStore();

    const listener1 = expect.createSpy(() => {});
    const listener2 = expect.createSpy(() => {});
    const listener3 = expect.createSpy(() => {});

    let listener3Added = false;
    const maybeAddThirdListener = () => {
      if (!listener3Added) {
        listener3Added = true;
        store.subscribe(() => listener3());
      }
    };

    store.subscribe(() => listener1());
    store.subscribe(() => {
      listener2();
      maybeAddThirdListener();
    });

    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(1);
    expect(listener2.calls.length).toBe(1);
    expect(listener3.calls.length).toBe(0);

    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(2);
    expect(listener2.calls.length).toBe(2);
    expect(listener3.calls.length).toBe(1);
  });

  it('uses the last snapshot of subscribers during nested dispatch', () => {
    const store = createBatchedStore();

    const listener1 = expect.createSpy(() => {});
    const listener2 = expect.createSpy(() => {});
    const listener3 = expect.createSpy(() => {});
    const listener4 = expect.createSpy(() => {});

    let unsubscribe4;
    const unsubscribe1 = store.subscribe(() => {
      listener1();
      expect(listener1.calls.length).toBe(1);
      expect(listener2.calls.length).toBe(0);
      expect(listener3.calls.length).toBe(0);
      expect(listener4.calls.length).toBe(0);

      unsubscribe1();
      unsubscribe4 = store.subscribe(listener4);
      store.dispatch({ type: 'foo' });

      expect(listener1.calls.length).toBe(1);
      expect(listener2.calls.length).toBe(1);
      expect(listener3.calls.length).toBe(1);
      expect(listener4.calls.length).toBe(1);
    });

    store.subscribe(listener2);
    store.subscribe(listener3);

    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(1);
    expect(listener2.calls.length).toBe(2);
    expect(listener3.calls.length).toBe(2);
    expect(listener4.calls.length).toBe(1);

    unsubscribe4();
    store.dispatch({ type: 'foo' });
    expect(listener1.calls.length).toBe(1);
    expect(listener2.calls.length).toBe(3);
    expect(listener3.calls.length).toBe(3);
    expect(listener4.calls.length).toBe(1);
  });

  it('should throw for invalid options', () => {
    expect(() => {
      batchedSubscribe(null);
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe('foo');
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe(42);
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe({ scheduler: 'foo' });
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe({ maxBatchDelay: -1 });
    }).toThrow(Error);
  });

  it('throws if listener is not a function', () => {
    const store = createBatchedStore();

    expect(() =>
      store.subscribe()
    ).toThrow();

    expect(() =>
      store.subscribe('')
    ).toThrow();

    expect(() =>
      store.subscribe(null)
    ).toThrow();

    expect(() =>
      store.subscribe(undefined)
    ).toThrow();
  });

  it('batches same-tick dispatches into one round via a custom scheduler', () => {
    const scheduled = [];
    const store = createBatchedStore({ scheduler: cb => scheduled.push(cb) });

    const order = [];
    store.subscribe(() => order.push('a'));
    store.subscribe(() => order.push('b'));
    store.subscribe(() => order.push('c'));

    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });

    expect(scheduled.length).toBe(1);
    expect(order.length).toBe(0);
    expect(store.getPendingCount()).toBe(3);

    store.flush();

    expect(order).toEqual(['a', 'b', 'c']);
    expect(store.getPendingCount()).toBe(0);
  });

  it('flushes pending notifications when maxBatchDelay elapses', (done) => {
    const store = createBatchedStore({ maxBatchDelay: 20 });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });

    expect(spy.calls.length).toBe(0);

    setTimeout(() => {
      expect(spy.calls.length).toBe(1);
      done();
    }, 80);
  });

  it('clears the pending timer when flush fires first', (done) => {
    const store = createBatchedStore({ maxBatchDelay: 20 });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.dispatch({ type: 'foo' });
    store.flush();

    expect(spy.calls.length).toBe(1);

    setTimeout(() => {
      expect(spy.calls.length).toBe(1);
      done();
    }, 80);
  });

  it('does not notify twice on consecutive flush calls', () => {
    const store = createBatchedStore({ scheduler: () => {} });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.dispatch({ type: 'foo' });

    store.flush();
    store.flush();
    store.flush();

    expect(spy.calls.length).toBe(1);
  });

  it('flush without pending notifications is a no-op', () => {
    const store = createBatchedStore({ scheduler: () => {} });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.flush();

    expect(spy.calls.length).toBe(0);
  });

  it('notifies remaining listeners and rethrows collected errors in order', () => {
    const store = createBatchedStore({ scheduler: () => {} });

    const errA = new Error('a');
    const errB = new Error('b');
    const order = [];
    const spyC = expect.createSpy();

    store.subscribe(() => {
      order.push('a');
      throw errA;
    });
    store.subscribe(() => {
      order.push('b');
      throw errB;
    });
    store.subscribe(() => {
      order.push('c');
      spyC();
    });

    store.dispatch({ type: 'foo' });

    let caught = null;
    try {
      store.flush();
    } catch (err) {
      caught = err;
    }

    expect(order).toEqual(['a', 'b', 'c']);
    expect(spyC.calls.length).toBe(1);
    expect(caught instanceof Error).toBe(true);
    expect(caught.errors).toEqual([errA, errB]);

    expect(() => store.flush()).toNotThrow();
  });

  it('collects listener errors in sync mode and throws from dispatch', () => {
    const store = createBatchedStore();

    const errA = new Error('a');
    const spyB = expect.createSpy();

    store.subscribe(() => {
      throw errA;
    });
    store.subscribe(spyB);

    let caught = null;
    try {
      store.dispatch({ type: 'foo' });
    } catch (err) {
      caught = err;
    }

    expect(spyB.calls.length).toBe(1);
    expect(caught instanceof Error).toBe(true);
    expect(caught.errors).toEqual([errA]);
  });

  it('does not notify unsubscribed listeners on flush and frees their slot', () => {
    const store = createBatchedStore({ scheduler: () => {} });
    const spyA = expect.createSpy();
    const spyB = expect.createSpy();

    const unsubscribeA = store.subscribe(spyA);
    store.subscribe(spyB);

    store.dispatch({ type: 'foo' });
    expect(store.getPendingCount()).toBe(2);

    unsubscribeA();
    expect(store.getPendingCount()).toBe(1);

    store.flush();

    expect(spyA.calls.length).toBe(0);
    expect(spyB.calls.length).toBe(1);
    expect(store.getPendingCount()).toBe(0);
  });

  it('triggers only once when both scheduler and maxBatchDelay are given', (done) => {
    const scheduled = [];
    const store = createBatchedStore({
      scheduler: cb => scheduled.push(cb),
      maxBatchDelay: 20
    });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.dispatch({ type: 'foo' });

    expect(scheduled.length).toBe(1);
    scheduled[0]();

    expect(spy.calls.length).toBe(1);

    setTimeout(() => {
      expect(spy.calls.length).toBe(1);
      done();
    }, 80);
  });

  it('lets maxBatchDelay win when it fires before the scheduler', (done) => {
    let scheduledCb = null;
    const store = createBatchedStore({
      scheduler: cb => {
        scheduledCb = cb;
      },
      maxBatchDelay: 20
    });
    const spy = expect.createSpy();

    store.subscribe(spy);
    store.dispatch({ type: 'foo' });

    setTimeout(() => {
      expect(spy.calls.length).toBe(1);
      scheduledCb();
      expect(spy.calls.length).toBe(1);
      done();
    }, 80);
  });

  it('does not arm a timer when a synchronous scheduler flushes immediately', () => {
    const originalSetTimeout = global.setTimeout;
    const setTimeoutSpy = expect.createSpy();
    global.setTimeout = setTimeoutSpy;

    try {
      const store = createBatchedStore({
        scheduler: cb => cb(),
        maxBatchDelay: 20
      });
      const spy = expect.createSpy();

      store.subscribe(spy);
      store.dispatch({ type: 'foo' });

      expect(spy.calls.length).toBe(1);
      expect(setTimeoutSpy.calls.length).toBe(0);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('notifies synchronously with the latest state when nothing is configured', () => {
    const store = batchedSubscribe()(createCounterStore)();
    const seen = [];

    store.subscribe(() => seen.push(store.getState()));
    store.dispatch({ type: 'inc' });

    expect(seen).toEqual([1]);
    expect(store.getPendingCount()).toBe(0);
  });
});
