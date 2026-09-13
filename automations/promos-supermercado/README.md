# Cazador de promos de supermercado

Workflow de n8n (`Cazador de promos de supermercado`, id `9rPQkRc64Y19ocse`) que vigila las
promociones de supermercado para las tarjetas de la casa y avisa por Telegram a través del bot **Robin**.

## Qué vigila

| Tarjeta | Banco | Dónde aplica |
|---|---|---|
| Visa Infinite Sapphire LATAM Pass | BCP | Wong, Vivanda, Flora & Fauna |
| American Express | Interbank | Wong, Vivanda, Flora & Fauna |
| Tarjeta Oh! | Financiera Oh! (Intercorp) | Vivanda (misma cadena que plazaVea) |

Tiendas de interés: **Wong** y **Vivanda** (cerca de casa) y **Flora & Fauna**. Compra online solo para
envasados; frescos siempre en tienda. El prompt del modelo ya sabe esto y lo usa para separar
"frescos en tienda" de "envasados online" en cada mensaje.

## Cadencia (y por qué)

| Cuándo | Modo | Qué manda |
|---|---|---|
| Todos los días 8:05 am | `diario` | Solo escribe si apareció una promo **nueva** o si **hoy** es día de una promo ya conocida (ej. "hoy jueves aplica..."). Si no hay nada, silencio. |
| Domingo 6:00 pm | `semana` | Plan de compras de la semana: qué día ir a qué tienda con qué tarjeta, promos para frescos en tienda, promos válidas online, y qué inscripciones hacer antes. |
| Día 1 del mes, 8:05 am | `mes` | Todas las promos del mes y recordatorio de inscribirse (Interbank y BCP renuevan sus campañas de supermercado mes a mes y casi siempre piden registro previo). |

Las promos de supermercado en Perú cambian casi siempre a inicio de mes y están atadas a un día de la
semana (jueves en Wong, lunes y miércoles en Vivanda, etc.). Por eso una revisión diaria silenciosa
es suficiente para atrapar lo que "aparece de la nada" sin generar ruido, y el resumen del domingo
es el que sirve para planear la compra semanal.

## Cómo funciona (nodos)

1. **Diario 8am y domingo 6pm** – Schedule Trigger con dos reglas (zona horaria America/Lima).
2. **Definir modo** – decide `diario` / `semana` / `mes` según hora y día.
3. **Listar fuentes** → **Traer paginas** – lee 13 páginas oficiales (Interbank, BCP, Tarjeta Oh!,
   Vivanda, Wong, Flora & Fauna). Si una falla, se anota y el flujo sigue.
4. **Correos de Dennys / Correos de Akemi** – Gmail: correos de los bancos y tiendas de los últimos 12
   días. Ahí suele llegar el enlace de inscripción de las campañas.
5. **Consolidar fuentes** – convierte el HTML a texto plano y junta todo.
6. **Promos conocidas** – lee la Data Table `Promos supermercado` (memoria del agente).
7. **Preparar prompt** → **Buscar y extraer promos** – Claude Sonnet vía OpenRouter con búsqueda web
   activada (`:online`). Devuelve JSON con banco, tarjeta, tienda, beneficio, días, vigencia,
   requisitos, si requiere inscripción, canal (tienda/online/ambos) y si aplica a frescos.
8. **Procesar respuesta** – normaliza, genera una `clave` por promo y detecta cuáles son nuevas.
9. **Armar mensaje** → **Avisar por Telegram (Robin)** – arma el mensaje según el modo y lo parte si
   supera el límite de Telegram.
10. **Filas para guardar** → **Guardar promos** – upsert en la Data Table para no repetir avisos.

## Mantenimiento

- Agregar o quitar páginas: editar la lista del nodo **Listar fuentes**.
- Cambiar tarjetas, tiendas o reglas: editar el mensaje de sistema del nodo **Buscar y extraer promos**.
- Cambiar horarios: nodo **Diario 8am y domingo 6pm**. El modo `semana` se activa cuando la corrida
  ocurre después del mediodía, así que si mueves el resumen semanal mantenlo en la tarde.
- Forzar que vuelva a avisar todo: vaciar la Data Table `Promos supermercado`.
- Costo aproximado: una llamada al modelo por corrida (unos 30 mil tokens de entrada) más las
  búsquedas web; del orden de unos pocos dólares al mes.

`workflow.js` es el código fuente del workflow en el SDK de n8n (`@n8n/workflow-sdk`), tal como se
creó en la instancia.
