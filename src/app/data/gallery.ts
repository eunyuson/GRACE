export interface GalleryContentSection {
  id: string; // Unique ID for key prop
  keyword: string;
  text: string;
  date?: string;
  image?: string;
  videoUrl?: string;
  videoPlayMode?: 'muted-autoplay' | 'manual' | 'autoplay'; // 음소거 자동재생 / 수동 / 소리 자동재생
  videoDisplayMode?: 'pip' | 'inline'; // pip: 미니 플레이어 (음악용), inline: 메인 화면 재생 (동영상용)
  pdfUrl?: string; // PDF 문서 URL
  externalUrl?: string; // 외부 링크 URL (클릭 시 새 탭에서 열림)
  // 일일 묵상(큐티) PDF 설정
  isDailyReading?: boolean | string;
  pdfStartDate?: string;
  pagesPerDay?: number | string;
  pdfFirstPage?: number | string; // 북의 실제 시작 페이지 (예: 표지/목차 제외)
}

export interface GalleryItemType {
  id: string | number;
  index: string;
  title: string;
  subtitle: string;
  image: string;
  type?: 'image' | 'video' | 'pdf' | 'link';
  externalUrl?: string; // 외부 링크 URL (type이 'link'인 경우)
  videoUrl?: string;
  videoPlayMode?: 'muted-autoplay' | 'manual' | 'autoplay'; // 음소거 자동재생 / 수동 / 소리 자동재생
  videoDisplayMode?: 'pip' | 'inline'; // pip: 미니 플레이어 (음악용), inline: 메인 화면 재생 (동영상용)
  pdfUrl?: string; // PDF 문서 URL
  // 일일 묵상(큐티) PDF 설정
  isDailyReading?: boolean | string;
  pdfStartDate?: string;
  pagesPerDay?: number | string;
  pdfFirstPage?: number | string; // 북의 실제 시작 페이지 (예: 표지/목차 제외)
  descTitle: string;
  desc: string;
  content: GalleryContentSection[];
}

const defaultContent: GalleryContentSection[] = [
  {
    id: 'story',
    keyword: 'STORY',
    text: `모든 파도는 바다의 호흡과 같습니다. 우리가 살아가는 매 순간 또한 거대한 섭리 안에서 오르고 내리는 리듬을 가지고 있습니다. 
이 사진은 멈춰있는 순간을 포착했지만, 그 안에는 끊임없이 흐르는 시간의 결이 담겨 있습니다.

은혜는 때로 거친 파도처럼 우리를 덮치기도 하고, 때로는 잔잔한 물결처럼 발목을 적시기도 합니다. 
중요한 것은 그 파도를 타는 법을 배우는 것이 아니라, 파도와 함께 호흡하는 법을 배우는 것입니다.`
  },
  {
    id: 'meditation',
    keyword: 'MEDITATION',
    text: `이 장면을 통해 우리는 무엇을 볼 수 있나요? 단순히 아름다운 풍경이 아니라, 그 이면에 숨겨진 고요한 질서를 마주하게 됩니다.
소란스러운 세상 속에서 잠시 멈추어 서서, 내면의 소리에 귀를 기울여보세요.

파도가 밀려오고 나가는 것처럼, 우리의 마음에도 채움과 비움이 필요합니다. 
오늘 하루, 당신의 마음을 채우고 있는 것은 무엇인가요? 그리고 비워야 할 것은 무엇인가요?`
  },
  {
    id: 'context',
    keyword: 'CONTEXT',
    text: `촬영 장소: 캘리포니아 중부 해안
시간: 오전 6시 42분, 해 뜰 무렵

이 사진은 빛이 어둠을 밀어내는 가장 극적인 순간에 촬영되었습니다. 
새벽의 차가운 공기와 따스한 햇살이 만나는 그 경계선에서, 자연은 가장 솔직한 표정을 보여줍니다.

Leica M11과 35mm 렌즈를 사용하여, 눈으로 보는 것보다 더 깊이 있는 질감을 담아내고자 했습니다.
과도한 보정 없이, 그날의 온도와 분위기를 있는 그대로 전달하는 데 초점을 맞췄습니다.`
  },
  {
    id: 'message',
    keyword: 'MESSAGE',
    text: `"파도가 지나간 자리에 모래가 다져지듯, 시련은 우리를 더 단단하게 만듭니다."

오늘 당신이 마주한 파도가 비록 거칠고 두렵게 느껴질지라도, 
그것이 지나간 뒤에는 더 넓고 평온한 해변이 기다리고 있음을 기억하세요.

우리는 혼자가 아닙니다. 같은 바다를 바라보며, 같은 파도를 타는 수많은 이들이 함께하고 있습니다.
오늘도 은혜의 파도 위에서 멋진 서핑을 즐기시길 응원합니다.`
  }
];

export const galleryItems: GalleryItemType[] = [
  {
    id: 1,
    index: "01",
    title: "DIRECTION",
    subtitle: "방향: 내면의 나침반을 따라서",
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop",
    descTitle: "DIRECTION",
    desc: "방향: 내면의 나침반을 따라서. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 2,
    index: "02",
    title: "SILENCE",
    subtitle: "침묵: 소란 속에서 찾은 평온",
    image: "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?q=80&w=1200&auto=format&fit=crop",
    descTitle: "SILENCE",
    desc: "침묵: 소란 속에서 찾은 평온. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 3,
    index: "03",
    title: "CERTAINTY",
    subtitle: "확신: 흔들리지 않는 믿음의 무게",
    image: "https://images.unsplash.com/photo-1444464666168-49d633b867ad?q=80&w=1200&auto=format&fit=crop",
    descTitle: "CERTAINTY",
    desc: "확신: 흔들리지 않는 믿음의 무게. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 4,
    index: "04",
    title: "MEANING",
    subtitle: "의미: 삶의 모든 조각이 빛나는 이유",
    image: "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=80&w=1200&auto=format&fit=crop",
    descTitle: "MEANING",
    desc: "의미: 삶의 모든 조각이 빛나는 이유. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 5,
    index: "05",
    title: "RELEASE",
    subtitle: "무거움: 죄책감을 내려놓는 시간",
    image: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?q=80&w=1200&auto=format&fit=crop",
    descTitle: "RELEASE",
    desc: "무거움: 죄책감을 내려놓는 시간. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 6,
    index: "06",
    title: "FOCUS",
    subtitle: "집중: 흩어진 마음을 하나로",
    image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=80&w=1200&auto=format&fit=crop",
    descTitle: "FOCUS",
    desc: "집중: 흩어진 마음을 하나로. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 7,
    index: "07",
    title: "FORGIVE",
    subtitle: "용서: 과거와 화해하는 용기",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop",
    descTitle: "FORGIVE",
    desc: "용서: 과거와 화해하는 용기. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 8,
    index: "08",
    title: "CONNECT",
    subtitle: "관계: 서로의 곁을 지키는 온기",
    image: "https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?q=80&w=1200&auto=format&fit=crop",
    descTitle: "CONNECT",
    desc: "관계: 서로의 곁을 지키는 온기. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 9,
    index: "09",
    title: "HABIT",
    subtitle: "습관: 매일을 채우는 거룩한 반복",
    image: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?q=80&w=1200&auto=format&fit=crop",
    descTitle: "HABIT",
    desc: "습관: 매일을 채우는 거룩한 반복. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  },
  {
    id: 10,
    index: "10",
    title: "LOVE",
    subtitle: "사랑: 가장 위대한 파도의 노래",
    image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1200&auto=format&fit=crop",
    descTitle: "LOVE",
    desc: "사랑: 가장 위대한 파도의 노래. 은혜의 파도 속에서 우리 각자가 발견하는 소중한 가치들입니다.",
    content: JSON.parse(JSON.stringify(defaultContent))
  }
];
