import {getAuthenticatedUser} from '../../../../backend/auth/session';
import {loadOfficialReferences} from '../../../../backend/services/market-data/official-references';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getAuthenticatedUser(request);
  if(!user)return Response.json({error:'Sign in to view this private workspace.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
  try{return Response.json(await loadOfficialReferences(),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'Market sources are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
