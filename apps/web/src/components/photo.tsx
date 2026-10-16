import { getImageProps, type StaticImageData } from 'next/image';

/** A plain img with the optimizer's srcset from `getImageProps`, so a page with a photo ships no image runtime. */
export function Photo({ src, alt, sizes, className }: { src: StaticImageData; alt: string; sizes: string; className?: string }) {
  const { src: url, ...props } = getImageProps({ src, alt, sizes, fill: true, className }).props;
  // eslint-disable-next-line @next/next/no-img-element -- these are the props next/image would render, minus its client component
  return <img src={url} {...props} alt={alt} />;
}
