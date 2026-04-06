// ==========================================
// app.js - Lógica principal de Parapente Colina
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // 0. ¡ENCENDER LOS ICONOS! (Esto es lo que faltaba)
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // ==========================================
    // 1. ANIMACIONES DE SCROLL
    // ==========================================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target); 
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.blur-in').forEach((el) => {
        observer.observe(el);
    });

    // ==========================================
    // 2. MENÚ MÓVIL (Hamburguesa)
    // ==========================================
    // NOTA: Revisa que en tu HTML, el botón de las 3 rayitas tenga id="mobile-menu-button"
    // y el contenedor del menú desplegable tenga id="mobile-menu"
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });

        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });
    } else {
        console.log("No se encontraron los IDs del menú móvil en el HTML.");
    }

    // ==========================================
    // 3. PRONÓSTICO DEL CLIMA (Viento)
    // ==========================================

    // Tus NUEVAS credenciales de Supabase
    const BACKEND_API_URL = 'https://hxwsmtfkfhltemwvfimt.supabase.co/functions/v1/weather-data';
    // Aquí pega todo el texto largo de tu "Publishable key" de la foto
    const SUPABASE_ANON_KEY = 'sb_publishable_oeAPU_XYx4qR6vwjDrnVSw_jFbW7Nm3'; 
    const flightLocation = 'Colina';


    const forecastContainer = document.getElementById('forecast-container');
    const loadingDiv = document.getElementById('forecast-loading');
    const errorDiv = document.getElementById('forecast-error');


async function obtenerClima() {
        if (!forecastContainer || !loadingDiv) return;

        try {
            const response = await fetch(`${BACKEND_API_URL}?location=${flightLocation}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error("Error en la respuesta de Supabase");
            
            const resJSON = await response.json();
            loadingDiv.classList.add('hidden');

            let lista = null;
            if (resJSON.data && resJSON.data.forecast) {
                lista = resJSON.data.forecast;
            }

            if (!lista || !Array.isArray(lista)) {
                throw new Error("Formato de datos no reconocido");
            }

            let htmlCards = '';
            lista.forEach(dia => {
                // 1. Usamos la fecha limpia que manda tu backend
                const fecha = new Date(dia.date + 'T12:00:00'); 
                const nombreDia = fecha.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
                
                // 2. Usamos el nuevo nombre del viento (wind_speed)
                // Nota: Lo multiplico por 3.6 asumiendo que el backend lo manda en m/s. 
                // Si ves que da números loquísimos (como 80 km/h), le quitamos el "* 3.6".
                const vientoKmH = Math.round(dia.wind_speed * 3.6);
                
                let estado = 'Ideal', color = 'text-green-500';
                if(vientoKmH > 25) { estado = 'Fuerte'; color = 'text-red-500'; }
                else if(vientoKmH < 5) { estado = 'Flojo'; color = 'text-yellow-500'; }

                htmlCards += `
                    <div class="bg-white p-4 rounded-xl border-2 border-gray-100 shadow-sm text-center transform transition duration-300 hover:scale-105 hover:border-parapente-accent/50 hover:shadow-md">
                        <p class="font-bold text-parapente-darkest mb-2 border-b border-gray-100 pb-2">${nombreDia}</p>
                        <div class="my-3 flex justify-center">
                            <img src="https://openweathermap.org/img/wn/01d@2x.png" alt="Icono clima" class="w-12 h-12 bg-parapente-background rounded-full">
                        </div>
                        <p class="text-xs text-gray-500 capitalize mb-2">${dia.conditions}</p> <div class="bg-gray-50 rounded-lg p-2 mb-2">
                            <p class="text-xl font-black text-parapente-accent">${vientoKmH} <span class="text-xs text-gray-500 font-normal">km/h</span></p>
                            <p class="text-[10px] text-gray-400 font-bold tracking-wider">VIENTO</p>
                        </div>
                        <p class="text-xs font-bold ${color}">${estado}</p>
                    </div>`;
            });

            forecastContainer.innerHTML = htmlCards;

        } catch (error) {
            console.error("Error final:", error);
            loadingDiv.classList.add('hidden');
            if(errorDiv) errorDiv.classList.remove('hidden');
        }
    }

    obtenerClima();
});