# Arquitectura

Web y extension consumen exclusivamente la API NestJS. Contratos Zod, validacion, precios, base, PDF e IA son paquetes compartidos. PostgreSQL conserva fotografias inmutables; el worker ejecuta tareas idempotentes. Los importes son enteros en centavos y el markup usa puntos basicos.
