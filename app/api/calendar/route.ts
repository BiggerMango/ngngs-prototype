import { NextRequest, NextResponse } from 'next/server';
import ical, { ICalCalendarMethod } from 'ical-generator';

interface DiscordScheduledEvent {
  id: string;
  guild_id: string;
  name: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time?: string;
  entity_metadata?: {
    location?: string;
  };
  status: number; // 1: Scheduled, 2: Active, 3: Completed, 4: Canceled
}

export async function GET(request: NextRequest) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  
  const feedType = searchParams.get('type') || 'all'; 
  const format = searchParams.get('format'); // 'json' für Frontend-Vorschau

  try {
    const discordResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 60 }, 
      }
    );

    if (!discordResponse.ok) {
      return NextResponse.json(
        { error: `Discord API Error: ${discordResponse.status}` },
        { status: discordResponse.status }
      );
    }

    const events: DiscordScheduledEvent[] = await discordResponse.json();

    // processing events: filtering, mapping, and sorting
    const processedEvents = events
      .filter((event) => 
        event.status !== 4 && event.status !== 3 ) // no canceled or completed events
      .map((event) => {
        const desc = event.description || '';
        const isVorstand = desc.toLowerCase().includes('#vorstand');

        return {
          id: event.id,
          title: event.name,
          description: desc.replace(/#vorstand/gi, '').trim(),
          start: event.scheduled_start_time,
          end: event.scheduled_end_time,
          location: event.entity_metadata?.location || 'Discord Server',
          type: isVorstand ? ('vorstand' as const) : ('events' as const),
        };
      })
      .filter((event) => {
        if (feedType === 'vorstand') return event.type === 'vorstand';
        if (feedType === 'events') return event.type === 'events';
        return true; 
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // json response for frontend preview
    if (format === 'json') {
      return NextResponse.json(processedEvents, {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
        },
      });
    }

    // ical generation
    const isVorstand = feedType === 'vorstand';
    const calendarName = isVorstand ? 'Engines Vorstandssitzungen' : 'Engines';
    const calendarColor = isVorstand ? '#3d9c73' : '#009c59';

    const calendar = ical({
      name: calendarName,
      method: ICalCalendarMethod.PUBLISH,
      ttl: 1800, // recommended 30 minutes until next update
    });

    calendar.x('X-WR-CALNAME', calendarName);
    calendar.x('X-WR-CALDESC', 'Offizieller Event-Kalender für die Engines');
    calendar.x('X-WR-TIMEZONE', 'Europe/Berlin');
    calendar.x('X-APPLE-CALENDAR-COLOR', calendarColor);
    calendar.x('X-OUTLOOK-COLOR', calendarColor);

    processedEvents.forEach((event) => {
      const startDate = new Date(event.start);
      const endDate = event.end
        ? new Date(event.end)
        : new Date(startDate.getTime() + 60 * 60 * 1000);

      calendar.createEvent({
        id: event.id,
        start: startDate,
        end: endDate,
        summary: event.title,
        description: event.description,
        location: event.location,
        url: `https://discord.com/events/${guildId}/${event.id}`,
        stamp: new Date(),
      });
    });

    return new Response(calendar.toString(), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="engines-events.ics"',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Error found while fetching Discord Events: ', error);
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    );
  }
}