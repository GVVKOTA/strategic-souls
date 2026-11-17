import Workspace from '../../frontend/features/legacy/workspace';
import {requireChatGPTUser} from '../../backend/auth/chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Legacy(){await requireChatGPTUser('/legacy');return <Workspace/>;}
