import { getImageProps, type StaticImageData } from 'next/image';

type PhotoProps = {
  src: StaticImageData;
  alt: string;
  sizes: string;
  className?: string;
  /**
   * The viewport width, as a CSS length, from which the photo shows. From there the browser requests it at once and at
   * high priority. Below it the browser never requests it, even though CSS hides the photo's box.
   */
  eagerFrom?: string;
};

/** A plain img with the optimizer's srcset from `getImageProps`, so a page with a photo ships no image runtime. */
export function Photo({ src, alt, sizes, className, eagerFrom }: PhotoProps) {
  const { src: url, srcSet, ...props } = getImageProps({ src, alt, sizes, fill: true, className }).props;
  if (eagerFrom === undefined) {
    // eslint-disable-next-line @next/next/no-img-element -- these are the props next/image would render, minus its client component
    return <img src={url} srcSet={srcSet} {...props} alt={alt} />;
  }
  // The img has no src of its own, so it fetches nothing until a source matches. A CSS-hidden img with loading="eager" would still fetch.
  return (
    <picture>
      <source media={`(min-width: ${eagerFrom})`} srcSet={srcSet} sizes={sizes} />
      <img {...props} sizes={undefined} alt={alt} loading="eager" fetchPriority="high" />
    </picture>
  );
}
