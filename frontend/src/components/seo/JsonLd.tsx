import { serializeJsonLd } from "@/lib/seo";

type JsonLdProps = {
  data: unknown;
  id?: string;
  nonce?: string;
};

export function JsonLd({ data, id, nonce }: JsonLdProps) {
  return (
    <script
      id={id}
      nonce={nonce}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
