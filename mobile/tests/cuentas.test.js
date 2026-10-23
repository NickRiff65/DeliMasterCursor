import { screen, userEvent } from 'expo-router/testing-library';
import Registro from '../src/app/registro';
import Recuperar from '../src/app/recuperar';
import { abrirApp, simularApi, errorApi, usarVariante, tokenGuardado, cliente, prestador } from './ayudas';

describe('Registro (términos obligatorios)', () => {
  async function completar(user, { nombre, apellido = 'Pérez', email, password }) {
    await user.type(screen.getByLabelText('Nombre'), nombre);
    await user.type(screen.getByLabelText('Apellido'), apellido);
    await user.type(screen.getByLabelText('Correo'), email);
    await user.type(screen.getByLabelText('Contraseña'), password);
  }

  test('no se puede crear la cuenta sin aceptar los términos', async () => {
    const llamadas = simularApi({});
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await completar(user, { nombre: 'Ana', email: 'ana@demo.cl', password: 'clave1234' });
    const crear = screen.getByRole('button', { name: 'Crear cuenta' });
    expect(crear).toBeDisabled();
    await user.press(crear);
    expect(llamadas).toHaveLength(0);
  });

  test('envía el rol de la app, la aceptación y omite los campos opcionales vacíos', async () => {
    const llamadas = simularApi({ 'POST /auth/registro': { token: 't-nuevo', usuario: { ...cliente, nombre: 'Ana Pérez' } } });
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await completar(user, { nombre: 'Ana', apellido: 'Pérez', email: 'ana@demo.cl', password: 'clave1234' });
    await user.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(llamadas[0].cuerpo).toEqual({
      nombre: 'Ana', apellido: 'Pérez', email: 'ana@demo.cl', password: 'clave1234', rol: 'cliente', acepta_terminos: true,
    });
    expect(tokenGuardado()).toBe('t-nuevo');
  });

  test('el apellido va en su propio campo y es obligatorio', async () => {
    simularApi({});
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Correo'), 'ana@demo.cl');
    await user.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await user.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    await user.type(screen.getByLabelText('Apellido'), 'Pérez');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  });

  test('la comuna se elige con un toque entre Chillán y Coihueco (y se puede desmarcar)', async () => {
    const llamadas = simularApi({ 'POST /auth/registro': { token: 't-nuevo', usuario: cliente } });
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await completar(user, { nombre: 'Ana', email: 'ana@demo.cl', password: 'clave1234' });
    expect(screen.getByRole('button', { name: '📍 Chillán' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '📍 Chillán' }));
    await user.press(screen.getByRole('button', { name: '📍 Chillán' }));          // la desmarca
    await user.press(screen.getByRole('button', { name: '📍 Coihueco' }));
    await user.press(screen.getByRole('checkbox'));
    await user.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(llamadas[0].cuerpo.comuna).toBe('Coihueco');
  });

  test('los errores de la API se muestran junto a cada campo', async () => {
    simularApi({
      'POST /auth/registro': errorApi(422, 'DATOS_INVALIDOS', 'Datos inválidos', {
        email: 'Ya existe una cuenta con este correo', password: 'Debe tener letras y números',
      }),
    });
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await completar(user, { nombre: 'Ana Pérez', email: 'valentina@demo.cl', password: 'clavesinnumeros' });
    await user.press(screen.getByRole('checkbox'));
    await user.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los campos marcados.');
    expect(screen.getByText('Ya existe una cuenta con este correo')).toBeOnTheScreen();
    expect(screen.getByText('Debe tener letras y números')).toBeOnTheScreen();
  });

  test('DeliMaster Pro registra maestros con sus días y horario de trabajo', async () => {
    usarVariante('pro');
    const llamadas = simularApi({ 'POST /auth/registro': { token: 't', usuario: prestador } });
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'María');
    await user.type(screen.getByLabelText('Apellido'), 'González');
    await user.type(screen.getByLabelText('Correo'), 'maria@demo.cl');
    await user.type(screen.getByLabelText('Contraseña'), 'clave1234');

    // Por defecto, todos los días de 08:00 a medianoche; quita el domingo y ajusta el horario
    expect(screen.getByText('🕒 Todos los días · 08:00 a medianoche')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '07:30' })).not.toBeOnTheScreen();   // parte a las 08:00
    await user.press(screen.getByRole('button', { name: 'Dom' }));
    await user.press(screen.getAllByRole('button', { name: '09:00' })[0]);          // fila "Desde"
    await user.press(screen.getAllByRole('button', { name: '22:00' }).at(-1));      // fila "Hasta"
    expect(screen.getByText('🕒 Lunes a sábado · 09:00 a 22:00')).toBeOnTheScreen();

    await user.press(screen.getByRole('checkbox'));
    await user.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Pantalla panel')).toBeOnTheScreen();
    expect(llamadas[0].cuerpo).toMatchObject({ rol: 'prestador', horario: { dias: [1, 2, 3, 4, 5, 6], desde: '09:00', hasta: '22:00' } });
  });

  test('sin días elegidos no se puede crear la cuenta de maestro', async () => {
    usarVariante('pro');
    simularApi({});
    await abrirApp({ ruta: '/registro', pantallas: { registro: Registro } });
    const user = userEvent.setup();
    for (const dia of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) await user.press(screen.getByRole('button', { name: dia }));
    await user.press(screen.getByRole('checkbox'));
    expect(screen.getByText('Elige al menos un día.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
  });
});

describe('Recuperar la contraseña', () => {
  async function pedirCodigo(user) {
    await user.type(screen.getByLabelText('Correo'), 'valentina@demo.cl');
    await user.press(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText('Código');
  }

  const respuestaGenerica = { mensaje: 'Si el correo está registrado, te enviamos un código.' };

  test('el código acepta solo 6 dígitos y las contraseñas deben coincidir', async () => {
    const llamadas = simularApi({ 'POST /auth/recuperar': respuestaGenerica });
    await abrirApp({ ruta: '/recuperar', pantallas: { recuperar: Recuperar } });
    const user = userEvent.setup();
    await pedirCodigo(user);
    expect(screen.getByText(respuestaGenerica.mensaje)).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Código'), '12a34-5678');
    expect(screen.getByLabelText('Código')).toHaveDisplayValue('123456');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'nueva1234');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'nueva12345');
    await user.press(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(screen.getByText('Las contraseñas no coinciden')).toBeOnTheScreen();
    expect(llamadas.map((l) => l.ruta)).toEqual(['/auth/recuperar']);   // no se llamó a restablecer
  });

  test('con el código correcto cambia la contraseña y entra a la app', async () => {
    const llamadas = simularApi({
      'POST /auth/recuperar': respuestaGenerica,
      'POST /auth/restablecer': { token: 't-restablecido', usuario: cliente },
    });
    await abrirApp({ ruta: '/recuperar', pantallas: { recuperar: Recuperar } });
    const user = userEvent.setup();
    await pedirCodigo(user);
    await user.type(screen.getByLabelText('Código'), '654321');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'nueva1234');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'nueva1234');
    await user.press(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(llamadas[1].cuerpo).toEqual({ email: 'valentina@demo.cl', codigo: '654321', nueva: 'nueva1234' });
    expect(tokenGuardado()).toBe('t-restablecido');
  });

  test('un código incorrecto muestra el error y permite pedir otro', async () => {
    simularApi({
      'POST /auth/recuperar': respuestaGenerica,
      'POST /auth/restablecer': errorApi(400, 'CODIGO_INVALIDO', 'El código no es válido o ya venció', { codigo: 'Código incorrecto' }),
    });
    await abrirApp({ ruta: '/recuperar', pantallas: { recuperar: Recuperar } });
    const user = userEvent.setup();
    await pedirCodigo(user);
    await user.type(screen.getByLabelText('Código'), '000000');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'nueva1234');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'nueva1234');
    await user.press(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es válido o ya venció');
    expect(screen.getByText('Código incorrecto')).toBeOnTheScreen();
    expect(tokenGuardado()).toBeNull();

    await user.press(screen.getByText('¿No te llegó? Pide otro código'));
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeOnTheScreen();
  });
});
