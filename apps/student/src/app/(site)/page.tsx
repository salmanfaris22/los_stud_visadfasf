import { CTA, CoursesShowcase, FAQ, Features, Hero, HowItWorks, Stats, Testimonials } from "@/features/landing/sections";
import { getCourses, getSite } from "@/lib/server-api";

export const revalidate = 60;

export default async function HomePage() {
  const [site, courses] = await Promise.all([getSite(), getCourses({ limit: 6 })]);
  const b = site.blocks;
  return (
    <>
      <Hero data={b.hero} />
      <Stats data={b.stats} />
      <Features data={b.features} />
      <CoursesShowcase courses={courses} />
      <HowItWorks data={b.how} />
      <Testimonials data={b.testimonials} />
      <FAQ data={b.faqs} />
      <CTA data={b.cta} />
    </>
  );
}
