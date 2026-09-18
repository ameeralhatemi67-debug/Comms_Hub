import type {Metadata} from 'next';
import {Store} from '@/lib/store';
import {Shell} from '@/components/shell';
import './globals.css';
export const metadata:Metadata={title:'مركز الاتصال المؤسسي',description:'نموذج تجربة المستخدم لمركز الاتصال المؤسسي، MVP 0.1'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><Store><Shell>{children}</Shell></Store></body></html>}
