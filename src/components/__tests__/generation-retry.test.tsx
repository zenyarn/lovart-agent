// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,screen,cleanup,act} from '@testing-library/react';
import {GenerationMessage} from '../canvas-workspace';
vi.mock('../model-icon',()=>({ModelIcon:()=>null}));
afterEach(cleanup);
it('makes GPT 2.5 paid retry explicit and prevents a second click while submitting',async()=>{
 let finish!:()=>void;const retry=vi.fn(()=>new Promise<void>(r=>{finish=r;}));
 render(<GenerationMessage generation={{id:'g',project_id:'p',model:'gpt25',prompt:'cup',config:{ratio:'1:1',resolution:'1K',referenceAssetIds:['a']},reference_asset_id:null,status:'succeeded',outputs:[],error:null,created_at:new Date().toISOString()}} assets={{}} disabled={false} onReference={()=>{}} onRetry={retry} onSaveRetry={async()=>{}} />);
 fireEvent.click(screen.getByText('重新生成'));
 expect(screen.queryByText('填入输入框')).toBeNull();
 fireEvent.click(screen.getByText('确认使用 GPT Image 2.5 重新生成'));
 expect((screen.getByText('提交中…') as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByText('提交中…'));
 expect(retry).toHaveBeenCalledTimes(1);
 await act(async()=>finish());
});
