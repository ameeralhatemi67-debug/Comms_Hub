'use client';
// The window's live part, loaded only once someone opens the window: the mail page's own
// providers (people, mail, messaging), the launcher with its numbers, and the window itself.
// Kept mounted while the window is minimised, so the numbers stay current.
import { unreadCount } from '@/lib/chat/rules';
import { inFolder, isApprover, isUnread } from '@/lib/mail/rules';
import { PeopleProvider } from '../people';
import { MailProvider, useMail } from '../mail/provider';
import { ChatProvider, useChat } from '../chat/provider';
import { Launcher, type LauncherProps } from './launcher';
import { Frame } from './frame';

export default function Live({ launcher, shown }: { launcher: LauncherProps | null; shown: boolean }) {
  return (
    <PeopleProvider>
      <MailProvider>
        <ChatProvider>
          {launcher && <Counted {...launcher} />}
          {shown && <Frame />}
        </ChatProvider>
      </MailProvider>
    </PeopleProvider>
  );
}

function Counted(props: LauncherProps) {
  const c = useChat();
  const m = useMail();
  const chat = c.rooms.filter((r) => !c.myMember(r.id)?.muted && unreadCount(c.messagesOf(r.id), c.myMember(r.id), c.me) > 0).length;
  const ctx = { me: m.me, role: m.role, now: m.now };
  const mail = m.views.filter((v) => inFolder(v, 'inbox', ctx) && isUnread(v, m.me, m.now)).length;
  // What waits for this person: outside mail held for approval, for the director and the assistant.
  const decide = isApprover(m.role) ? m.views.filter((v) => inFolder(v, 'gate', ctx)).length : 0;
  return <Launcher {...props} unread={chat + mail} decide={decide} />;
}
