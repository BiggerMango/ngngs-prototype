'use client';

import { useState, useEffect } from 'react';
import "@/styles/globals.css";

interface EventItem {
  id: string;
  title: string;
  description: string;
  start: string;
  end?: string;
  location: string;
  type: 'events' | 'vorstand';
}

export default function CalendarSubscribePage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [copiedFeed, setCopiedFeed] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'events' | 'vorstand'>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }

    let isSubscribed = true;
    setLoading(true);

    // use http cache
    fetch('/api/calendar?format=json&type=all', {
      cache: 'default',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isSubscribed && Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch((err) => {
        console.error('Fehler beim Abrufen der Events:', err);
      })
      .finally(() => {
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  const getFeedUrls = (type: string) => {
    const httpUrl = `${baseUrl}/api/calendar?type=${type}`;
    const webcalUrl = httpUrl.replace(/^https?:\/\//, 'webcal://');
    return { httpUrl, webcalUrl };
  };

  const handleCopy = (type: string) => {
    const { httpUrl } = getFeedUrls(type);
    navigator.clipboard.writeText(httpUrl);
    setCopiedFeed(type);
    setTimeout(() => setCopiedFeed(null), 2000);
  };

  // filter events based on selectedFilter
  const filteredEvents = events.filter((e) => {
    if (selectedFilter === 'all') return true;
    return e.type === selectedFilter;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 pt-28 pb-12 space-y-12">
      {/* Live preview of events */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-anek font-bold mb-6 text-transparent bg-clip-text title-gradient">Anstehende Termine</h2>
            <p className="text-sm text-slate-500">
              Unsere geplanten Aktivitäten
            </p>
          </div>

          {/* Filter-Buttons */}
          <div className="flex bg-slate-200/70 p-1 rounded-xl text-sm font-medium self-start sm:self-auto">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                selectedFilter === 'all'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Alle ({events.length})
            </button>
            <button
              onClick={() => setSelectedFilter('events')}
              className={`px-3 py-1.5 rounded-lg transition ${
                selectedFilter === 'events'
                  ? 'bg-white text-[#009c59] shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Events ({events.filter((e) => e.type === 'events').length})
            </button>
            <button
              onClick={() => setSelectedFilter('vorstand')}
              className={`px-3 py-1.5 rounded-lg transition ${
                selectedFilter === 'vorstand'
                  ? 'bg-white text-[#3d9c73] shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vorstand ({events.filter((e) => e.type === 'vorstand').length})
            </button>
          </div>
        </div>

        {/* Event-Liste */}
        {loading ? (
          <div className="text-center py-8 text-slate-400">Events werden geladen...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-slate-500 bg-white rounded-xl border border-dashed border-slate-200">
            Aktuell sind keine Events in dieser Kategorie geplant.
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredEvents.map((event, index) => {
              const startDate = new Date(event.start);
              const day = startDate.getDate();
              const month = startDate.toLocaleDateString('de-DE', { month: 'short' });
              const time = startDate.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              });

              const isVorstand = event.type === 'vorstand';

              return (
                <div
                  key={`${event.id}-${index}`}
                  className="bg-white p-4 rounded-xl border border-slate-200 flex items-start gap-4 hover:border-slate-300 transition shadow-xs"
                >
                  {/* Datums-Badge */}
                  <div
                    className={`flex flex-col items-center justify-center min-w-[56px] h-[56px] rounded-xl font-bold text-white ${
                      isVorstand ? 'bg-[#3d9c73]' : 'bg-[#009c59]'
                    }`}
                  >
                    <span className="text-xs uppercase tracking-wider">{month}</span>
                    <span className="text-lg leading-none">{day}</span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-900 truncate">{event.title}</h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isVorstand
                            ? 'bg-[#3d9c73]/10 text-[#3d9c73]'
                            : 'bg-[#009c59]/10 text-[#009c59]'
                        }`}
                      >
                        {isVorstand ? 'Vorstand' : 'Event'}
                      </span>
                    </div>

                    {event.description && (
                      <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                        {event.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                      <span>🕒 {time} Uhr</span>
                      <span>📍 {event.location}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Subscription */}

      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Kalender abonnieren</h2>
          <p className="text-slate-600">
            Abonniere deinen bevorzugten Feed, damit du immer auf dem aktuellsten Stand 
            bist.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="border rounded-2xl p-6 shadow-sm border-l-4 border-l-[#009c59] bg-white flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-anek font-bold mb-6 text-transparent bg-clip-text title-gradient">Community Events</h3>
              <p className="text-sm text-slate-600 mb-6">
                Alle großen Events, Watch-Togethers und Spieleabende.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <a
                href={baseUrl ? getFeedUrls('events').webcalUrl : '#'}
                className="w-full text-center py-2.5 px-4 bg-[#009c59] hover:opacity-90 text-white font-medium rounded-xl transition"
              >
                Direkt abonnieren
              </a>
              <button
                onClick={() => handleCopy('events')}
                className="w-full text-center py-2 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition"
              >
                {copiedFeed === 'events' ? '✓ Link kopiert!' : 'URL kopieren'}
              </button>
            </div>
          </div>

          <div className="border rounded-2xl p-6 shadow-sm border-l-4 border-l-[#3d9c73] bg-white flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-anek font-bold mb-6 text-transparent bg-clip-text title-gradient">Planungstreffen</h3>
              <p className="text-sm text-slate-600 mb-6">
                Du willst selbst aktiv werden? Dann schau bei unseren Planungstreffen vorbei und bringe deine Ideen ein.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <a
                href={baseUrl ? getFeedUrls('vorstand').webcalUrl : '#'}
                className="w-full text-center py-2.5 px-4 bg-[#3d9c73] hover:opacity-90 text-white font-medium rounded-xl transition"
              >
                Direkt abonnieren
              </a>
              <button
                onClick={() => handleCopy('vorstand')}
                className="w-full text-center py-2 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition"
              >
                {copiedFeed === 'vorstand' ? '✓ Link kopiert!' : 'URL kopieren'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}