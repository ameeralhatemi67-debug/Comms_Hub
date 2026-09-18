import {HubPage} from '@/components/hub-page';
export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const {slug=[]}=await params;return <HubPage route={slug}/>}
