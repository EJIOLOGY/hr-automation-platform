export interface HrContentItem {
  id: string;
  title: string;
  answer: string;
  status: 'PLACEHOLDER' | 'APPROVED';
}

export interface HrContentConfig {
  policy: Record<string, HrContentItem>;
  benefits: Record<string, HrContentItem>;
  leave: Record<string, HrContentItem>;
  verification: Record<string, HrContentItem>;
}
