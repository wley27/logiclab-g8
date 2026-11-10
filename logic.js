/* Logic Lab · lógica compartida por el simulador, el modelo y los retos. */
(function (root, factory) {
  'use strict';
  const logic = factory();
  if (typeof module === 'object' && module.exports) module.exports = logic;
  else root.G8Logic = logic;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const gates = Object.freeze({
    AND: { title: 'Y lógica', family: 'Básica', expression: 'S = A · B', rule: 'Todas las condiciones deben cumplirse.', description: 'La salida se enciende únicamente cuando las dos entradas están encendidas.', example: 'Una caja fuerte', inputA: 'Llave correcta', inputB: 'Código correcto', result: 'La caja se abre', analogy: 'Para abrirla necesitas la llave Y el código. Una sola condición no basta.', hint: 'Prueba encender las dos entradas. ¿Qué ocurre si apagas solo una?', operation: (a, b) => a & b },
    OR: { title: 'O lógica', family: 'Básica', expression: 'S = A + B', rule: 'Con una condición es suficiente.', description: 'La salida se enciende si al menos una de las dos entradas está encendida. También si lo están ambas.', example: 'Una alarma de casa', inputA: 'Puerta abierta', inputB: 'Ventana abierta', result: 'Suena la alarma', analogy: 'La alarma suena si se abre la puerta O la ventana; también si se abren las dos.', hint: 'Activa una entrada y luego las dos. OR acepta ambos casos.', operation: (a, b) => a | b },
    NOT: { title: 'Negación', family: 'Básica', expression: 'S = ¬A', rule: 'Siempre devuelve el valor contrario.', description: 'Esta compuerta tiene una sola entrada: convierte un 0 en 1 y un 1 en 0.', example: 'Una luz nocturna', inputA: 'Hay luz de día', result: 'La lámpara se enciende', analogy: 'La lámpara se enciende cuando NO hay luz de día. Al detectar luz, se apaga.', hint: 'Solo necesitas A. Observa cómo la salida siempre es su opuesto.', operation: (a) => 1 - a },
    NAND: { title: 'Y negada', family: 'Universal', expression: 'S = ¬(A · B)', rule: 'La excepción es que ambas estén encendidas.', description: 'Es una AND seguida de una negación. La salida solo se apaga cuando ambas entradas valen 1.', example: 'Un aviso de seguridad', inputA: 'Casco colocado', inputB: 'Arnés colocado', result: 'Se enciende el aviso', analogy: 'El aviso permanece encendido mientras falte el casco o el arnés. Solo se apaga si están ambos.', hint: 'Compara con AND: para las mismas entradas, las salidas son opuestas.', operation: (a, b) => 1 - (a & b) },
    NOR: { title: 'O negada', family: 'Universal', expression: 'S = ¬(A + B)', rule: 'Se enciende cuando ninguna se cumple.', description: 'Es una OR seguida de una negación. La salida vale 1 únicamente si ambas entradas valen 0.', example: 'Una sala disponible', inputA: 'Hay una reunión', inputB: 'Hay una reserva', result: 'Sala disponible', analogy: 'La sala está disponible si NO hay reunión NI reserva. Una sola de ellas la ocupa.', hint: 'Empieza con ambas entradas apagadas. Después activa cualquiera.', operation: (a, b) => 1 - (a | b) },
    XOR: { title: 'O exclusiva', family: 'Comparación', expression: 'S = A ⊕ B', rule: 'Diferentes entradas, salida encendida.', description: 'La salida vale 1 cuando las entradas son diferentes: una encendida y la otra apagada.', example: 'Un detector de diferencias', inputA: 'Primer interruptor', inputB: 'Segundo interruptor', result: 'Hay una diferencia', analogy: 'El indicador se enciende si los interruptores están en posiciones distintas. Si coinciden, se apaga.', hint: 'Compara 01, 10 y 11. La diferencia con OR está en la última combinación.', operation: (a, b) => a ^ b },
    XNOR: { title: 'Equivalencia', family: 'Comparación', expression: 'S = ¬(A ⊕ B)', rule: 'Iguales entradas, salida encendida.', description: 'La salida vale 1 cuando las entradas son iguales, tanto 00 como 11.', example: 'Un comparador de bits', inputA: 'Bit recibido', inputB: 'Bit esperado', result: 'Los bits coinciden', analogy: 'El comparador confirma la coincidencia cuando el bit recibido es igual al esperado, incluso si ambos son 0.', hint: 'Es el opuesto de XOR. Prueba las dos maneras de tener entradas iguales.', operation: (a, b) => 1 - (a ^ b) }
  });
  const keys = Object.freeze(Object.keys(gates));
  function output(gate, a, b = 0) {
    if (!Object.hasOwn(gates, gate)) throw new RangeError('Compuerta desconocida: ' + gate);
    if ((a !== 0 && a !== 1) || (b !== 0 && b !== 1)) throw new TypeError('Las entradas deben ser bits: 0 o 1.');
    return gates[gate].operation(a, b);
  }
  function combinations(gate) {
    if (!Object.hasOwn(gates, gate)) throw new RangeError('Compuerta desconocida: ' + gate);
    return gate === 'NOT' ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  }
  function explanation(gate, a, b) {
    const s = output(gate, a, b);
    const reasons = {
      AND: s ? 'Las dos entradas valen 1. Se cumplen ambas condiciones.' : 'Al menos una entrada vale 0. AND necesita que ambas valgan 1.',
      OR: s ? 'Hay al menos una entrada en 1. Eso basta para activar OR.' : 'Las dos entradas valen 0. No hay ninguna condición activa.',
      NOT: a ? 'A vale 1. NOT invierte la entrada y devuelve 0.' : 'A vale 0. NOT invierte la entrada y devuelve 1.',
      NAND: s ? 'No están ambas en 1. AND daría 0 y la negación lo convierte en 1.' : 'Ambas valen 1. AND daría 1 y la negación lo convierte en 0.',
      NOR: s ? 'Ambas valen 0. OR daría 0 y la negación lo convierte en 1.' : 'Hay alguna entrada en 1. OR daría 1 y la negación lo convierte en 0.',
      XOR: s ? 'Las entradas son diferentes. Exactamente una vale 1.' : 'Las entradas son iguales. XOR necesita que sean diferentes.',
      XNOR: s ? 'Las entradas son iguales. El comparador confirma la coincidencia.' : 'Las entradas son diferentes. No hay coincidencia.'
    };
    return reasons[gate];
  }
  return Object.freeze({ gates, keys, output, combinations, explanation });
});
