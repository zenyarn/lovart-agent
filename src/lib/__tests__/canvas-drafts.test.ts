import {it,expect} from 'vitest';
import {mergeCanvasDraft,restoreCanvasDraft} from '../canvas-drafts';
const node=(id:string,asset=true)=>({id,position:{x:0,y:0},width:400,height:800,style:{width:400,height:800},data:{asset:asset?{id}:undefined}});
it('does not resurrect deleted nodes while merging newly generated nodes',()=>{
 const result=mergeCanvasDraft([node('deleted'),node('kept'),node('new')],[{...node('kept'),position:{x:50,y:60}}],new Set(['deleted']));
 expect(result.map(n=>n.id)).toEqual(['kept','new']);expect(result[0].position).toEqual({x:50,y:60});
});
it('restores image deletions, dimensions and position while preserving pending placeholders',()=>{
 const result=restoreCanvasDraft([node('deleted'),node('kept'),node('pending',false)],[{id:'kept',x:30,y:40,width:200,height:400}]);
 expect(result.map(n=>n.id)).toEqual(['kept','pending']);expect(result[0]).toMatchObject({position:{x:30,y:40},width:200,height:400,style:{width:200,height:400}});
});
import {canvasDraftMatches} from '../canvas-drafts';
it('recognizes an acknowledged snapshot despite a changed revision without discarding newer edits',()=>{
 const a={revision:1,nodes:[{id:'n',x:30,y:40,width:200,height:400}],viewport:{x:1,y:2,zoom:1},settings:{}};
 expect(canvasDraftMatches(a,{...a,revision:2} as typeof a)).toBe(true);
 expect(canvasDraftMatches(a,{...a,nodes:[{...a.nodes[0],x:31}]})).toBe(false);
 expect(canvasDraftMatches(a,{...a,nodes:[]})).toBe(false);
});
