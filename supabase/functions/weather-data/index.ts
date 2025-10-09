import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Los encabezados CORS son esenciales para que el Frontend pueda acceder.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =================================================================
// Interfaces de Datos
// =================================================================

interface DayForecast {
  date: string;
  temperature_max: number;
  temperature_min: number;
  temperature_avg: number;
  conditions: string;
  wind_speed: number; // en km/h
}

interface ForecastData {
  location: string;
  forecast: DayForecast[];
  fetched_at: string;
}

// =================================================================
// FUNCIÓN PRINCIPAL DE SUPABASE
// =================================================================

// Punto de entrada de la función Deno/Supabase
Deno.serve(async (req) => {
  // Manejo de peticiones preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Usamos 'Santiago' como valor por defecto, como estaba en tu código.
    const location = url.searchParams.get('location') || 'Santiago';
    console.log(`Fetching 5-day forecast for: ${location}`);

    // Inicializa el cliente Supabase (usa la clave de rol de servicio para permisos de administrador)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // =================================================================
    // 1. CACHÉ: Revisar datos recientes (Forecasts expiran en 6 horas)
    // =================================================================
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data: cachedData, error: cacheError } = await supabaseClient
      .from('forecast_cache')
      .select('forecast_data')
      .eq('location', location)
      .gte('fetched_at', sixHoursAgo)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cachedData && !cacheError) {
      console.log('Returning cached 5-day forecast');
      return new Response(
        JSON.stringify({
          data: cachedData.forecast_data as ForecastData,
          source: 'cache',
          message: 'Data from cache (less than 6 hours old)'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // =================================================================
    // 2. API EXTERNA: OpenWeatherMap
    // =================================================================
    const OPENWEATHER_API_KEY = Deno.env.get('OPENWEATHER_API_KEY');

    if (!OPENWEATHER_API_KEY) {
      // Este error es crucial y debe detener la función si la clave no está.
      throw new Error('OPENWEATHER_API_KEY is not set in environment secrets.');
    }

    // Usamos el endpoint de pronóstico de 5 días / 3 horas
    const weatherResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)},CL&appid=${OPENWEATHER_API_KEY}&units=metric&lang=es`
    );

    if (!weatherResponse.ok) {
      throw new Error(`Weather API error: ${weatherResponse.status}`);
    }

    const weatherJson = await weatherResponse.json();

    // =================================================================
    // 3. PROCESAMIENTO: Agregar pronósticos por día
    // =================================================================

    // Agregamos pronósticos de 3 horas en pronósticos diarios (ESTO RESUELVE LA ADVERTENCIA DE VS CODE)
    const dailyForecasts = new Map<string, {
      temps: number[];
      conditions: string[];
      windSpeeds: number[];
    }>();

    // Limitamos a los próximos 5 días, excluyendo las horas restantes de hoy
    const now = new Date();
    // Encuentra el primer pronóstico de 3 horas que comienza mañana
    const list = weatherJson.list.filter((item: any) => new Date(item.dt * 1000).getDate() !== now.getDate());

    list.forEach((item: any) => {
      // Fecha en formato 'YYYY-MM-DD'
      const dateKey = new Date(item.dt * 1000).toISOString().split('T')[0];
      const windSpeedKmh = parseFloat((item.wind.speed * 3.6).toFixed(1)); // Convertir m/s a km/h

      if (!dailyForecasts.has(dateKey)) {
        dailyForecasts.set(dateKey, {
          temps: [],
          conditions: [],
          windSpeeds: [],
        });
      }

      const data = dailyForecasts.get(dateKey)!;
      data.temps.push(item.main.temp);
      data.conditions.push(item.weather[0].description);
      data.windSpeeds.push(windSpeedKmh);
    });

    // 4. Transformar los datos agregados en el formato final
    const forecast: DayForecast[] = Array.from(dailyForecasts.entries())
      .slice(0, 5) // Tomar solo los primeros 5 días
      .map(([dateKey, data]) => ({
        date: dateKey,
        temperature_max: Math.max(...data.temps),
        temperature_min: Math.min(...data.temps),
        // Redondear a un decimal
        temperature_avg: parseFloat((data.temps.reduce((a, b) => a + b, 0) / data.temps.length).toFixed(1)),
        conditions: data.conditions[Math.floor(data.conditions.length / 2)], // Condición de la mitad del día
        wind_speed: Math.round(data.windSpeeds.reduce((a, b) => a + b, 0) / data.windSpeeds.length)
      }));

    const forecastData: ForecastData = {
      location,
      forecast,
      fetched_at: new Date().toISOString()
    };

    // 5. CACHÉ: Guardar el nuevo pronóstico
    const { error: insertError } = await supabaseClient
      .from('forecast_cache')
      .insert({
        location,
        forecast_data: forecastData,
        fetched_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error caching forecast data:', insertError);
    }

    console.log('Returning fresh 5-day forecast');
    return new Response(
      JSON.stringify({
        data: forecastData,
        source: 'api',
        message: 'Fresh 5-day forecast from OpenWeatherMap'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in weather-data function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: 'Failed to fetch weather data'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}, { noAuth: true }); 