import Workspace from '../workspace';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Legacy(){await requireChatGPTUser('/legacy');return <Workspace/>;}
