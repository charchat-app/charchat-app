// CHAT-US-04-AC04 접근 불가 공통 안내: 대화 내용 대신 안내를 보이고 홈으로 보낸다.
import { EmptyState } from '@/components/ui';
import { ConversationFrame } from '@/features/chat/components/ConversationFrame';

/** 최종 안내 문구·디자인은 아직 정하지 않았다(대화 4 설계). 지금 문구는 설계의 안내 취지를 따른 임시안이다. */
export const ACCESS_DENIED_TITLE = '접속할 수 없습니다';
export const ACCESS_DENIED_DESCRIPTION = '이 대화방은 열 수 없어요. 내 대화만 볼 수 있습니다.';

export function ConversationAccessDenied({
  title,
  onBack,
  onHome,
}: {
  title: string;
  onBack?: () => void;
  /** 이전 화면이 없어도(주소로 바로 열어도) 홈으로 갈 수 있어야 한다. */
  onHome: () => void;
}) {
  return (
    <ConversationFrame title={title} onBack={onBack}>
      <EmptyState
        title={ACCESS_DENIED_TITLE}
        description={ACCESS_DENIED_DESCRIPTION}
        actionLabel="홈으로 이동"
        onAction={onHome}
      />
    </ConversationFrame>
  );
}
