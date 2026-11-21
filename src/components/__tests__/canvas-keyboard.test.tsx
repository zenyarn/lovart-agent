// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,screen,cleanup,waitFor} from '@testing-library/react';
import {CanvasWorkspace} from '../canvas-workspace';
import type {ProjectDetail} from '@/lib/types';
const m=vi.hoisted(()=>({api:vi.fn(),flow:{fitView:vi.fn(),setViewport:vi.fn()}}));
vi.mock('@xyflow/react',()=>({ReactFlowProvider:({children}:{children:React.ReactNode})=>children,useReactFlow:()=>m.flow,ReactFlow:({onNodesChange}:{onNodesChange:(c:unknown)=>void})=><button onClick={()=>onNodesChange({applyTo:(nodes:object[])=>nodes.map(n=>({...n,selected:true})),getByType:()=>[]})}>选中节点</button>}));
vi.mock('../composer',()=>({Composer:()=> <textarea aria-label="输入文字"/>}));
vi.mock('../model-icon',()=>({ModelIcon:()=>null}));
vi.mock('@/lib/client-api',()=>({api:(...args:unknown[])=>m.api(...args)}));
const detail:ProjectDetail={project:{id:'p',name:'test',updated_at:'',cover_asset_id:null,revision:0,viewport:{x:0,y:0,zoom:1},model_settings:{}},assets:{a:{id:'a',mime:'image/png',width:400,height:800,url:'https://example.com/a.png'}},nodes:[{id:'n',asset_id:'a',generation_id:null,x:0,y:0,width:200,height:400}],generations:[]};
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it('copies selected assets and keeps text deletion separate from canvas deletion',async()=>{
 m.api.mockImplementation(async(path:string,options?:RequestInit)=>path.endsWith('/agent')?{runs:[]}:options?{revision:1}:detail);
 render(<CanvasWorkspace initial={detail}/>);
 fireEvent.click(screen.getByText('选中节点'));
 fireEvent.keyDown(screen.getByLabelText('输入文字'),{key:'Backspace'});
 expect(localStorage.getItem('lovart-canvas:p')).toBeNull();
 let copied = '';
 fireEvent.copy(screen.getByText('选中节点'), {clipboardData:{setData:(_type:string,value:string)=>{copied=value;}}});
 fireEvent.paste(screen.getByText('选中节点'), {clipboardData:{getData:()=>copied}});
 await waitFor(()=>expect(m.api).toHaveBeenCalledWith('/api/projects/p/canvas',expect.objectContaining({method:'POST'})));
 fireEvent.click(screen.getByText('选中节点'));
 fireEvent.keyDown(screen.getByText('选中节点'),{key:'Delete'});
 expect(JSON.parse(localStorage.getItem('lovart-canvas:p')!).nodes).toEqual([]);
});
it('clears an already-saved local draft even if its revision is older',async()=>{
 m.api.mockImplementation(async(path:string)=>path.endsWith('/agent')?{runs:[]}:detail);
 localStorage.setItem('lovart-canvas:p',JSON.stringify({revision:-1,nodes:[{id:'n',x:0,y:0,width:200,height:400}],viewport:detail.project.viewport,settings:{}}));
 render(<CanvasWorkspace initial={detail}/>);
 await waitFor(()=>expect(localStorage.getItem('lovart-canvas:p')).toBeNull());
 expect(screen.queryByText(/发现较旧/)).toBeNull();
});
