import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://patchlinex.ai';

  const routes = [
    '',
    '/dashboard',
    '/scanner',
    '/scanner/history',
    '/github',
    '/jira',
    '/upload',
    '/login',
    '/onboarding',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'daily',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
