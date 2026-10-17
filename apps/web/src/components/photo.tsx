import { getImageProps, type StaticImageData } from 'next/image';
import { preload } from 'react-dom';

type PhotoProps = {
  src: StaticImageData;
  alt: string;
  sizes: string;
  className?: string;
  /**
   * The viewport width, as a CSS length, from which the photo shows. From there the browser preloads it at high
   * priority. Below it the photo's box must be hidden by CSS, so its lazy img fetches nothing.
   */
  eagerFrom?: string;
};

/** A plain img with the optimizer's srcset from `getImageProps`, so a page with a photo ships no image runtime. */
export function Photo({ src, alt, sizes, className, eagerFrom }: PhotoProps) {
  const { src: url, srcSet, ...props } = getImageProps({ src, alt, sizes, fill: true, className }).props;
  if (eagerFrom !== undefined) {
    preload(url, { as: 'image', imageSrcSet: srcSet, imageSizes: sizes, media: `(min-width: ${eagerFrom})`, fetchPriority: 'high' });
  }
  // eslint-disable-next-line @next/next/no-img-element -- these are the props next/image would render, minus its client component
  return <img src={url} srcSet={srcSet} {...props} alt={alt} />;
}
