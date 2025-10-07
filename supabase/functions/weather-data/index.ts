import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WeatherData {
  location: string;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_direction: string | null;
  weather_description: string | null;
  fetched_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const location = url.searchParams.get('location') || 'Santiago';
    
    console.log(`Fetching weather data for: ${location}`);

    // Nota: Supabase proporciona SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY automáticamente
    // si el proyecto está correctamente linkeado y con sus secrets
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check cache first (data less than 30 minutes old)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: cachedData, error: cacheError } = await supabaseClient
      .from('weather_cache')
      .select('*')
      .eq('location', location)
      .gte('fetched_at', thirtyMinutesAgo)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cachedData && !cacheError) {
      console.log('Returning cached weather data');
      return new Response(
        JSON.stringify({ 
          data: cachedData, 
          source: 'cache',
          message: 'Data from cache (less than 30 minutes old)'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Since Chilean Meteorological Service doesn't have a public REST API,
    // we'll use OpenWeatherMap as a reliable alternative for Chilean cities
    
    const OPENWEATHER_API_KEY = Deno.env.get('OPENWEATHER_API_KEY');
    
    if (!OPENWEATHER_API_KEY) {
      console.log('OpenWeatherMap API key not configured, returning mock data');
      
      // Return mock data for development
      const mockData: WeatherData = {
        location,
        temperature: 18 + Math.random() * 10,
        humidity: 50 + Math.random() * 30,
        wind_speed: 5 + Math.random() * 15,
        wind_direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
        weather_description: ['Despejado', 'Parcialmente nublado', 'Nublado', 'Viento'][Math.floor(Math.random() * 4)],
        fetched_at: new Date().toISOString()
      };

      // Cache the mock data
      await supabaseClient.from('weather_cache').insert(mockData);

      return new Response(
        JSON.stringify({ 
          data: mockData, 
          source: 'mock',
          message: 'Mock data - Add OPENWEATHER_API_KEY secret for real weather data'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Fetch real weather data from OpenWeatherMap
    const weatherResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)},CL&appid=${OPENWEATHER_API_KEY}&units=metric&lang=es`
    );

    if (!weatherResponse.ok) {
      throw new Error(`Weather API error: ${weatherResponse.status}`);
    }

    const weatherJson = await weatherResponse.json();
    
    // Función para convertir grados a dirección cardinal (simplificado)
    const degToCardinal = (deg: number): string => {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(deg / 45) % 8;
        return directions[index];
    };

    const weatherData: WeatherData = {
      location,
      temperature: weatherJson.main?.temp || null,
      humidity: weatherJson.main?.humidity || null,
      wind_speed: weatherJson.wind?.speed || null,
      // Usamos la conversión simplificada
      wind_direction: weatherJson.wind?.deg ? degToCardinal(weatherJson.wind.deg) : null,
      weather_description: weatherJson.weather?.[0]?.description || null,
      fetched_at: new Date().toISOString()
    };

    // Cache the new data
    const { error: insertError } = await supabaseClient
      .from('weather_cache')
      .insert(weatherData);

    if (insertError) {
      console.error('Error caching weather data:', insertError);
    }

    console.log('Returning fresh weather data');
    return new Response(
      JSON.stringify({ 
        data: weatherData, 
        source: 'api',
        message: 'Fresh data from weather service'
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
});
