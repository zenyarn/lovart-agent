import {it,expect,vi} from 'vitest';
import {waitForModelSlot} from '../agent/rate-limit';
it('shares reserved slots across concurrent model requests',async()=>{
 vi.useFakeTimers();
 // timers/promises uses real timers, so verify reserved delay through a short interval.
 vi.useRealTimers();
 const starts:number[]=[];
 await Promise.all([1,2,3].map(async()=>{await waitForModelSlot('test',30);starts.push(Date.now());}));
 expect(starts[2]-starts[0]).toBeGreaterThanOrEqual(50);
});
it('does not send an aborted request',async()=>{
 const signal=AbortSignal.abort();
 await expect(waitForModelSlot('abort',0,signal)).rejects.toThrow();
});
