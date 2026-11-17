import {getChatGPTUser} from '../../../chatgpt-auth';
import {marketSnapshot} from '../../../../lib/x1/market-data';
export const dynamic='force-dynamic';
export async function GET(){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'Sign in to view this private workspace.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
  try{return Response.json(await marketSnapshot(),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'Market sources are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
