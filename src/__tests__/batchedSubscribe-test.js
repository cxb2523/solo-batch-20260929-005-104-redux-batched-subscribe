import { batchedSubscribe } from '../';
import expect from 'expect';

function createStoreShape() {
  return {
    dispatch: expect.createSpy(),
    subscribe: expect.createSpy()
  };
}

function createBatchedStore(batch = (cb) => cb()) {
  const baseStore = createStoreShape();
  const createStore = () => baseStore;
  const batchedStore = batchedSubscribe(batch)(createStore)();
  batchedStore.base = baseStore;

  return batchedStore;
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

  it('should throw for invalid batch callback', () => {
    expect(() => {
      batchedSubscribe(null);
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe(undefined);
    }).toThrow(Error);

    expect(() => {
      batchedSubscribe('foo');
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
});

describe('batchedSubscribe() with scheduler/maxBatchDelay', () => {
  function createRealStore() {
    let state = 0;
    return {
      dispatch(action) {
        state += 1;
        return action;
      },
      getState() {
        return state;
      },
      subscribe: expect.createSpy()
    };
  }

  function createScheduledStore(options) {
    const baseStore = createRealStore();
    const store = batchedSubscribe(options)(() => baseStore)();
    store.base = baseStore;
    return store;
  }

  it('defers notification until the custom scheduler runs its callback', () => {
    const callbacks = [];
    const store = createScheduledStore({ scheduler: cb => callbacks.push(cb) });
    const listener = expect.createSpy();
    store.subscribe(listener);

    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });

    expect(listener.calls.length).toBe(0);
    expect(callbacks.length).toBe(1);

    callbacks[0]();
    expect(listener.calls.length).toBe(1);
  });

  it('notifies listeners in subscription order', () => {
    const callbacks = [];
    const store = createScheduledStore({ scheduler: cb => callbacks.push(cb) });
    const order = [];

    store.subscribe(() => order.push('first'));
    store.subscribe(() => order.push('second'));
    store.subscribe(() => order.push('third'));

    store.dispatch({ type: 'foo' });
    store.flush();

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('flushes pending notifications once when maxBatchDelay elapses', (done) => {
    const store = createScheduledStore({ maxBatchDelay: 10 });
    const listener = expect.createSpy();
    store.subscribe(listener);

    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });
    expect(listener.calls.length).toBe(0);

    setTimeout(() => {
      expect(listener.calls.length).toBe(1);
      done();
    }, 40);
  });

  it('does not notify twice when flush is called repeatedly and clears the timer', (done) => {
    const store = createScheduledStore({ maxBatchDelay: 10 });
    const listener = expect.createSpy();
    store.subscribe(listener);

    store.dispatch({ type: 'foo' });
    store.flush();
    store.flush();
    store.flush();
    expect(listener.calls.length).toBe(1);

    setTimeout(() => {
      expect(listener.calls.length).toBe(1);
      done();
    }, 40);
  });

  it('keeps notifying after a listener throws and rethrows collected errors on flush', () => {
    const store = createScheduledStore({ scheduler: () => {} });
    const errA = new Error('listener A failed');
    const errC = new Error('listener C failed');
    const order = [];

    store.subscribe(() => {
      order.push('a');
      throw errA;
    });
    store.subscribe(() => order.push('b'));
    store.subscribe(() => {
      order.push('c');
      throw errC;
    });

    store.dispatch({ type: 'foo' });

    let caught;
    try {
      store.flush();
    } catch (err) {
      caught = err;
    }

    expect(order).toEqual(['a', 'b', 'c']);
    expect(caught).toBeAn(Error);
    expect(caught.errors).toEqual([errA, errC]);
  });

  it('rethrows the original error when a single listener throws', () => {
    const store = createScheduledStore({ scheduler: () => {} });
    const failure = new Error('boom');
    const after = expect.createSpy();

    store.subscribe(() => {
      throw failure;
    });
    store.subscribe(after);

    store.dispatch({ type: 'foo' });
    expect(() => store.flush()).toThrow('boom');
    expect(after.calls.length).toBe(1);
  });

  it('skips unsubscribed listeners on flush and frees their pending slot', () => {
    const store = createScheduledStore({ scheduler: () => {} });
    const listenerA = expect.createSpy();
    const listenerB = expect.createSpy();

    const unsubscribeA = store.subscribe(listenerA);
    store.subscribe(listenerB);

    store.dispatch({ type: 'foo' });
    expect(store.getPendingListenerCount()).toBe(2);

    unsubscribeA();
    expect(store.getPendingListenerCount()).toBe(1);

    store.flush();
    expect(listenerA.calls.length).toBe(0);
    expect(listenerB.calls.length).toBe(1);
    expect(store.getPendingListenerCount()).toBe(0);
  });

  it('notifies synchronously with the latest state when nothing is scheduled', () => {
    const store = createScheduledStore({});
    const seenStates = [];
    store.subscribe(() => seenStates.push(store.getState()));

    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'foo' });

    expect(seenStates).toEqual([1, 2]);
    expect(store.getPendingListenerCount()).toBe(0);
  });

  it('triggers only once when both scheduler and maxBatchDelay are given', (done) => {
    const callbacks = [];
    const store = createScheduledStore({
      scheduler: cb => callbacks.push(cb),
      maxBatchDelay: 10
    });
    const listener = expect.createSpy();
    store.subscribe(listener);

    store.dispatch({ type: 'foo' });
    callbacks[0]();
    expect(listener.calls.length).toBe(1);

    setTimeout(() => {
      expect(listener.calls.length).toBe(1);
      callbacks[0]();
      expect(listener.calls.length).toBe(1);
      done();
    }, 40);
  });

  it('lets the timeout win when it fires before the scheduler callback', (done) => {
    const callbacks = [];
    const store = createScheduledStore({
      scheduler: cb => callbacks.push(cb),
      maxBatchDelay: 5
    });
    const listener = expect.createSpy();
    store.subscribe(listener);

    store.dispatch({ type: 'foo' });

    setTimeout(() => {
      expect(listener.calls.length).toBe(1);
      callbacks[0]();
      expect(listener.calls.length).toBe(1);
      done();
    }, 30);
  });
});
